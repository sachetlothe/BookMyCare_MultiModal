"""Team (staff) features that work WITHOUT reading patients' data by default.

* /staff/stats - anonymous counters plus counts of plain columns, small groups suppressed.
* /staff/support-requests and /staff/patients/{id}... - only for patients who currently allow
  support access. Staff see structured data (profile, history, lab values with the line they
  were read from) and can correct it; they never get original files or full report text.
  Every view and change is written to the patient's audit log.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import Analysis, LabResult, MedicalHistoryEntry, MedicalReport, SupportGrant, User
from app.services import stats, support
from app.services.lab_history import LabCorrectionError, correct_lab_value
from app.services.lab_parser import SPEC_BY_KEY

router = APIRouter(prefix="/staff", tags=["staff"])


def require_staff(user: User = Depends(get_current_user)) -> User:
    if (user.role or "patient") != "staff":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff only")
    return user


def _suppress(rows: list[tuple[str, str, int]], k: int) -> list[dict]:
    return [{"period": p, "dimension": d, "count": c if c >= k else None, "display": str(c) if c >= k else f"<{k}"} for p, d, c in rows]


@router.get("/stats")
def team_stats(staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    k = get_settings().stats_min_count
    analyses = db.execute(select(Analysis.created_at, Analysis.urgency)).all()
    by_month: dict[tuple[str, str], int] = {}
    for created, urgency in analyses:
        key = (created.strftime("%Y-%m") if created else "unknown", urgency or "unknown")
        by_month[key] = by_month.get(key, 0) + 1
    reports = db.execute(select(MedicalReport.kind, func.count()).group_by(MedicalReport.kind)).all()
    tests = db.execute(select(LabResult.test_code, func.count()).group_by(LabResult.test_code).order_by(func.count().desc())).all()
    patients = db.scalar(select(func.count()).select_from(User).where(User.role != "staff")) or 0
    return {
        "min_count": k,
        "note": "Anonymous counts only. No individual patient data is used or shown; groups smaller than "
                f"{k} are hidden so no one can be identified.",
        "totals": {
            "patients": patients if patients >= k else f"<{k}",
            "files_by_kind": _suppress([("all", kind, n) for kind, n in reports], k),
            "analyses_by_month_and_urgency": _suppress(sorted(((p, u, n) for (p, u), n in by_month.items()), reverse=True), k),
            "lab_results_by_test": _suppress([("all", SPEC_BY_KEY[c].name if c in SPEC_BY_KEY else c, n) for c, n in tests], k),
        },
        "counters": stats.report(db, k),
        "not_yet_counted": stats.pending(db),
    }


@router.get("/support-requests")
def support_requests(staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    support.purge_expired(db)
    rows = db.execute(select(SupportGrant.user_id, User.email, SupportGrant.reason, SupportGrant.created_at, SupportGrant.expires_at)
                      .join(User, User.id == SupportGrant.user_id).order_by(SupportGrant.expires_at)).all()
    return [{"patient_id": u, "email": e, "reason": r, "granted_at": c, "expires_at": x} for u, e, r, c, x in rows]


class _Ctx:
    """The patient's data session (only with an active grant); NoActiveGrant becomes 403."""

    def __init__(self, patient_id: int, staff: User):
        self.cm = support.patient_session(patient_id, staff)

    def __enter__(self) -> Session:
        try:
            return self.cm.__enter__()
        except support.NoActiveGrant as exc:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This patient has not allowed support access (or it has expired)") from exc

    def __exit__(self, *exc):
        return self.cm.__exit__(*exc)


@router.get("/patients/{patient_id}")
def view_patient(patient_id: int, staff: User = Depends(require_staff)):
    with _Ctx(patient_id, staff) as pdb:
        p = pdb.get(User, patient_id)
        if p is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
        prof = p.profile
        history = pdb.scalars(select(MedicalHistoryEntry).where(MedicalHistoryEntry.user_id == patient_id)
                              .order_by(MedicalHistoryEntry.event_date.desc().nulls_last())).all()
        reports = pdb.scalars(select(MedicalReport).where(MedicalReport.user_id == patient_id, MedicalReport.kind == "report")
                              .order_by(MedicalReport.report_date.desc().nulls_last(), MedicalReport.id.desc())).all()
        out = {
            "patient": {"id": p.id, "email": p.email, "full_name": p.full_name},
            "grant": {"expires_at": support.active_grant(pdb, patient_id).expires_at},
            "profile": None if prof is None else {
                "sex": prof.sex, "date_of_birth": prof.date_of_birth, "allergies": prof.allergies,
                "chronic_conditions": prof.chronic_conditions, "current_medications": prof.current_medications,
            },
            "history": [{"id": h.id, "category": h.category, "title": h.title, "details": h.details,
                         "event_date": h.event_date, "is_ongoing": h.is_ongoing} for h in history],
            "reports": [{
                "id": r.id, "title": r.title, "report_date": r.report_date, "extraction_status": r.extraction_status,
                "lab_values": [{k: v.get(k) for k in ("key", "test", "value", "unit", "ref_low", "ref_high", "status", "raw", "corrected", "original_value")}
                               for v in (r.lab_values or [])],
            } for r in reports],
            "not_available": "Original files and full report text are visible to the patient only.",
        }
        support.audit(pdb, patient_id, staff, "support_viewed", f"Staff member {staff.email} viewed profile, history and lab values")
        pdb.commit()
        return out


class LabCorrection(BaseModel):
    value: float
    note: str | None = Field(None, max_length=300)


@router.patch("/patients/{patient_id}/reports/{report_id}/labs/{code}")
def staff_correct_lab(patient_id: int, report_id: int, code: str, body: LabCorrection, staff: User = Depends(require_staff)):
    with _Ctx(patient_id, staff) as pdb:
        r = pdb.get(MedicalReport, report_id)
        if r is None or r.user_id != patient_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
        p = pdb.get(User, patient_id)
        try:
            old = correct_lab_value(pdb, r, code, body.value, p.profile.sex if p.profile else None)
        except LabCorrectionError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
        spec = SPEC_BY_KEY[code]
        support.audit(pdb, patient_id, staff, "lab_value_corrected",
                      f"{staff.email} changed {spec.name} on '{r.title}' from {old if old is not None else '(not read)'} to {body.value:g} {spec.unit}"
                      + (f" - {body.note}" if body.note else ""))
        pdb.commit()
        return {"ok": True, "previous": old, "value": body.value}


class HistoryFix(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    details: str | None = Field(None, max_length=2000)
    event_date: date | None = None
    is_ongoing: bool | None = None
    note: str | None = Field(None, max_length=300)


@router.patch("/patients/{patient_id}/history/{entry_id}")
def staff_fix_history(patient_id: int, entry_id: int, body: HistoryFix, staff: User = Depends(require_staff)):
    with _Ctx(patient_id, staff) as pdb:
        e = pdb.get(MedicalHistoryEntry, entry_id)
        if e is None or e.user_id != patient_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "History entry not found")
        changes = body.model_dump(exclude_unset=True, exclude={"note"})
        for k, v in changes.items():
            if v is not None or k in ("details", "event_date"):
                setattr(e, k, v)
        support.audit(pdb, patient_id, staff, "history_corrected",
                      f"{staff.email} edited history entry '{e.title}' ({', '.join(changes) or 'no fields'})" + (f" - {body.note}" if body.note else ""))
        pdb.commit()
        return {"ok": True}

