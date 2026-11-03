from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, defer

from app.api.deps import get_current_user, get_file_key, require_file_key
from app.core.config import get_settings
from app.db.session import get_db
from app.models import MedicalReport, User
from app.schemas.report import ReportDetail, ReportSummary, ReportUpdate
from app.services import extraction
from app.services.file_store import FileMissing, FileUnreadable, PatientKeyRequired, StorageError, get_file_store, new_stored_name
from app.services import stats
from app.services.lab_history import LabCorrectionError, correct_lab_value, sync_report_labs
from app.services.support import audit
from app.services.lab_parser import SPEC_BY_KEY, parse_lab_values
from app.services.patient_data import seal_report_text, text_context
from app.services.patient_keys import decrypt_text

router = APIRouter(prefix="/reports", tags=["reports"])
log = logging.getLogger("bookmycare.reports")


def _read_original(r: MedicalReport, key: bytes) -> bytes:
    try:
        return get_file_store().load(r.stored_filename, key)
    except PatientKeyRequired as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in again to unlock your files.") from exc
    except FileMissing as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stored file is missing") from exc
    except FileUnreadable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Stored file cannot be decrypted (wrong FILE_ENCRYPTION_KEY?)") from exc
    except StorageError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "File storage is unavailable") from exc


def _summary(r: MedicalReport) -> ReportSummary:
    s = ReportSummary.model_validate(r)
    s.lab_count = len(r.lab_values or [])
    return s


def _detail(r: MedicalReport, key: bytes | None) -> ReportDetail:
    d = ReportDetail.model_validate(r)
    # The extracted text is sealed with the patient's key; only their own requests can read it.
    d.extracted_text = decrypt_text(r.extracted_text, key, text_context(r))
    d.lab_count = len(r.lab_values or [])
    d.file_download_allowed = get_settings().allow_file_download
    return d


def _run_extraction(r: MedicalReport, data: bytes, sex: str | None) -> None:
    res = extraction.extract(data, r.content_type, r.kind)
    r.extraction_status = res.status
    r.extraction_method = res.method
    r.extracted_text = res.text or None
    r.extraction_error = res.error
    r.image_features = res.image_features
    r.lab_values = parse_lab_values(res.text, sex) if res.text else []


@router.post("", response_model=ReportDetail, status_code=status.HTTP_201_CREATED)
async def upload_report(
    file: UploadFile = File(...),
    kind: Literal["report", "image"] = Form("report"),
    title: str | None = Form(None),
    report_type: str | None = Form(None),
    report_date: date | None = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    key: bytes = Depends(require_file_key),
):
    s = get_settings()
    limit = s.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"File is larger than {s.max_upload_mb} MB")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty")
    filename = Path(file.filename or "upload").name[:200]
    ctype = extraction.detect_content_type(filename, file.content_type, data[:16])
    if ctype is None or ctype not in extraction.ALLOWED_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Unsupported file type. Upload PDF, PNG, JPG, WEBP, BMP, TIFF, TXT or CSV.")
    if kind == "image" and ctype not in extraction.IMAGE_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Medical images must be PNG, JPG, WEBP, BMP or TIFF.")
    if report_date and report_date > date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Report date cannot be in the future")

    stored = new_stored_name()
    # Encryption, storage I/O, PDF parsing and OCR are blocking; run them in a worker thread
    # so one upload does not stall every other request on the event loop.
    try:
        await run_in_threadpool(get_file_store().save, stored, data, key)
    except StorageError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "File storage is unavailable") from exc

    r = MedicalReport(
        user_id=user.id, kind=kind, title=(title or filename).strip()[:200] or filename,
        report_type=(report_type or None), original_filename=filename, stored_filename=stored,
        content_type=ctype, size_bytes=len(data), report_date=report_date,
    )
    await run_in_threadpool(_run_extraction, r, data, user.profile.sex if user.profile else None)
    seal_report_text(r, key)
    db.add(r)
    db.flush()
    sync_report_labs(db, r)  # one lab_results row per recognised test, for trends
    stats.count_report(db, r)  # anonymous counters for team reports (no user id, month only)
    db.commit()
    db.refresh(r)
    return _detail(r, key)


@router.get("", response_model=list[ReportSummary])
def list_reports(
    kind: Literal["report", "image"] | None = None,
    limit: int | None = Query(None, ge=1, le=500, description="Optional page size; omit to return all"),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # The summary never needs the (possibly large) extracted text, so don't load it.
    q = select(MedicalReport).options(defer(MedicalReport.extracted_text)).where(MedicalReport.user_id == user.id)
    if kind:
        q = q.where(MedicalReport.kind == kind)
    q = q.order_by(MedicalReport.created_at.desc(), MedicalReport.id.desc()).offset(offset)
    if limit is not None:
        q = q.limit(limit)
    rows = db.scalars(q).all()
    return [_summary(r) for r in rows]


def _get(report_id: int, user: User, db: Session) -> MedicalReport:
    r = db.get(MedicalReport, report_id)
    if not r or r.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return r


@router.get("/{report_id}", response_model=ReportDetail)
def get_report(report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
               key: bytes = Depends(require_file_key)):
    return _detail(_get(report_id, user, db), key)


@router.patch("/{report_id}", response_model=ReportDetail)
def update_report(report_id: int, body: ReportUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                  key: bytes | None = Depends(get_file_key)):
    r = _get(report_id, user, db)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("report_date") and changes["report_date"] > date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Report date cannot be in the future")
    if "title" in changes and changes["title"] is not None:
        r.title = changes["title"].strip()[:200] or r.title
    if "report_type" in changes:
        r.report_type = changes["report_type"] or None
    if "report_date" in changes:
        r.report_date = changes["report_date"]
        sync_report_labs(db, r)  # trend dates follow the report date
    db.commit()
    db.refresh(r)
    return _detail(r, key)


class LabFix(BaseModel):
    value: float


@router.patch("/{report_id}/labs/{code}", response_model=ReportDetail)
def correct_lab(report_id: int, code: str, body: LabFix, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                key: bytes = Depends(require_file_key)):
    """Let the patient fix a value that was read wrongly (or add one that was missed). Trends update too."""
    r = _get(report_id, user, db)
    try:
        old = correct_lab_value(db, r, code, body.value, user.profile.sex if user.profile else None)
    except LabCorrectionError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    spec = SPEC_BY_KEY[code]
    audit(db, user.id, user, "lab_value_corrected", f"You changed {spec.name} on '{r.title}' from {old if old is not None else '(not read)'} to {body.value:g} {spec.unit}")
    db.commit()
    db.refresh(r)
    return _detail(r, key)


@router.get("/{report_id}/file")
def download_report(report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                    key: bytes = Depends(require_file_key)):
    """The original file, for its owner only (decrypted with the patient's own key)."""
    r = _get(report_id, user, db)
    if not get_settings().allow_file_download:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Original files are sealed after upload. Their extracted results are shown instead.")
    data = _read_original(r, key)
    return Response(data, media_type=r.content_type, headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(r.original_filename)}",
    })


@router.post("/{report_id}/reprocess", response_model=ReportDetail)
def reprocess_report(report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                     key: bytes = Depends(require_file_key)):
    r = _get(report_id, user, db)
    _run_extraction(r, _read_original(r, key), user.profile.sex if user.profile else None)
    seal_report_text(r, key)
    sync_report_labs(db, r)
    db.commit()
    db.refresh(r)
    return _detail(r, key)


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = _get(report_id, user, db)
    stored = r.stored_filename
    db.delete(r)
    db.commit()
    try:
        get_file_store().delete(stored)
    except StorageError:  # the record is gone; an orphaned ciphertext is unreadable without the key
        log.warning("Could not delete stored file %s", stored)
