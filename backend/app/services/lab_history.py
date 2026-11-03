"""Keep the ``lab_results`` table in step with each report's extracted lab values."""
from __future__ import annotations

from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import LabResult, LabTestCatalog, MedicalReport
from app.services.lab_catalog import ensure_catalog
from app.services.lab_parser import SPEC_BY_KEY


def report_test_date(r: MedicalReport) -> date:
    if r.report_date:
        return r.report_date
    return r.created_at.date() if r.created_at else date.today()


def sync_report_labs(db: Session, r: MedicalReport) -> int:
    """Replace this report's rows in lab_results. The report must already have an id."""
    db.execute(delete(LabResult).where(LabResult.report_id == r.id))
    if r.kind != "report":
        return 0
    values = [v for v in (r.lab_values or []) if v.get("key") in SPEC_BY_KEY and isinstance(v.get("value"), (int, float))]
    if not values:
        return 0
    codes = {v["key"] for v in values}
    known = set(db.scalars(select(LabTestCatalog.code).where(LabTestCatalog.code.in_(codes))).all())
    if codes - known:
        ensure_catalog(db)
    when = report_test_date(r)
    seen: set[str] = set()
    for v in values:
        if v["key"] in seen:
            continue
        seen.add(v["key"])
        db.add(LabResult(
            user_id=r.user_id, report_id=r.id, test_code=v["key"], test_date=when,
            data={  # sealed with the patient's key on flush
                "value": float(v["value"]), "unit": v.get("unit") or SPEC_BY_KEY[v["key"]].unit,
                "ref_low": v.get("ref_low"), "ref_high": v.get("ref_high"), "status": v.get("status") or "normal",
            },
        ))
    db.flush()
    return len(seen)


class LabCorrectionError(ValueError):
    pass


def correct_lab_value(db: Session, r: MedicalReport, code: str, value: float, sex: str | None) -> float | None:
    """Correct (or add) one lab value of a report, e.g. when the text was misread.
    Returns the previous value (None if the test was added). Keeps the source line for reference."""
    from app.services.lab_parser import _make

    spec = SPEC_BY_KEY.get(code)
    if spec is None:
        raise LabCorrectionError("Unknown test")
    lo, hi = spec.plausible
    if not (lo <= value <= hi):
        raise LabCorrectionError(f"{spec.name} must be between {lo:g} and {hi:g} {spec.unit}")
    if r.kind != "report":
        raise LabCorrectionError("Only lab reports have lab values")
    values = [dict(v) for v in (r.lab_values or [])]
    old = next((v for v in values if v.get("key") == code), None)
    new = _make(spec, float(value), (old or {}).get("raw") or "", sex)
    new["corrected"] = True
    new["original_value"] = (old or {}).get("original_value", (old or {}).get("value"))
    if old is None:
        values.append(new)
    else:
        values[values.index(old)] = new
    r.lab_values = values  # reassigned so the change is saved (and sealed)
    db.flush()
    sync_report_labs(db, r)
    return old.get("value") if old else None
