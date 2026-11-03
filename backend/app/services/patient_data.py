"""Seal a patient's stored data with their own file key (run at sign-in, when the key is available)."""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.sealing import mark_for_sealing
from app.models import Analysis, LabResult, MedicalHistoryEntry, MedicalReport, PatientProfile, User
from app.services.file_store import FileMissing, FileUnreadable, StorageError, get_file_store
from app.services.patient_keys import encrypt_text, is_encrypted_text

log = logging.getLogger("bookmycare.patient_data")


def text_context(r: MedicalReport) -> str:
    """Binds encrypted report text to its owner and report, so it cannot be moved to another record."""
    return f"{r.user_id}:{r.stored_filename}"


def seal_report_text(r: MedicalReport, key: bytes) -> None:
    if r.extracted_text and not is_encrypted_text(r.extracted_text):
        r.extracted_text = encrypt_text(r.extracted_text, key, text_context(r))


def seal_user_data(db: Session, user: User, key: bytes) -> int:
    """Move everything of this patient that is still readable without their key - older files
    (plain or server key), extracted text and plain database fields - to the patient's key.
    The session must already hold the key. Returns how many items changed; never fails sign-in."""
    store = get_file_store()
    changed = mark_for_sealing(user)
    for model in (PatientProfile, MedicalHistoryEntry, Analysis, LabResult):
        for obj in db.scalars(select(model).where(model.user_id == user.id)).all():
            changed += mark_for_sealing(obj)
    for r in db.scalars(select(MedicalReport).where(MedicalReport.user_id == user.id)).all():
        try:
            if store.seal_for_patient(r.stored_filename, key):
                changed += 1
        except FileMissing:
            pass
        except (FileUnreadable, StorageError) as exc:
            log.warning("Could not seal file of report %s: %s", r.id, exc)
        if r.extracted_text and not is_encrypted_text(r.extracted_text):
            seal_report_text(r, key)
            changed += 1
        changed += mark_for_sealing(r)
    return changed
