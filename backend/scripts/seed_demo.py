"""Create a demo account populated with SYNTHETIC data.

    python -m scripts.seed_demo
Login: demo@bookmycare.dev / DemoPass123  (development only)
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

from sqlalchemy import select

from app.core.security import hash_password
from app.db.migrate import upgrade_head
from app.db.session import SessionLocal
from app.models import MedicalHistoryEntry, MedicalReport, PatientProfile, User
from app.services import extraction
from app.services.file_store import get_file_store, new_stored_name
from app.services.lab_catalog import ensure_catalog
from app.services.lab_history import sync_report_labs
from app.services.patient_data import seal_report_text, seal_user_data
from app.db.sealing import open_instance, set_session_key
from app.services.patient_keys import create_recovery_code, ensure_user_key
from app.services.lab_parser import parse_lab_values
from app.services.retrieval import seed_curated

SAMPLES = Path(__file__).resolve().parents[1] / "sample_data"
DEMO_EMAIL = "demo@bookmycare.dev"
DEMO_PASSWORD = "DemoPass123"


def _add_file(db, user: User, key: bytes, filename: str, kind: str, title: str, report_type: str, report_date: date):
    data = (SAMPLES / filename).read_bytes()
    ctype = extraction.detect_content_type(filename, None, data[:16])
    stored = new_stored_name()
    get_file_store().save(stored, data, key)  # sealed with the demo patient's own key
    res = extraction.extract(data, ctype, kind)
    r = MedicalReport(
        user_id=user.id, kind=kind, title=title, report_type=report_type, original_filename=filename,
        stored_filename=stored, content_type=ctype, size_bytes=len(data), report_date=report_date,
        extraction_status=res.status, extraction_method=res.method, extracted_text=res.text or None,
        extraction_error=res.error, image_features=res.image_features,
        lab_values=parse_lab_values(res.text, "female") if res.text else [],
    )
    seal_report_text(r, key)
    db.add(r)
    db.flush()
    sync_report_labs(db, r)
    return r


# Earlier synthetic results so the demo account shows lab trends.
FOLLOWUPS = [
    ("synthetic_followup_2025-09.txt", "Follow-up blood tests (synthetic)", date(2025, 9, 15)),
    ("synthetic_followup_2026-03.txt", "Follow-up blood tests (synthetic)", date(2026, 3, 12)),
]


def _add_followups(db, user: User, key: bytes) -> int:
    have = set(db.scalars(select(MedicalReport.original_filename).where(MedicalReport.user_id == user.id)).all())
    added = 0
    for filename, title, when in FOLLOWUPS:
        if filename not in have:
            _add_file(db, user, key, filename, "report", title, "blood_test", when)
            added += 1
    return added


def main() -> None:
    upgrade_head()
    with SessionLocal() as db:
        seed_curated(db)
        ensure_catalog(db)
        existing = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if existing:
            key = ensure_user_key(existing, DEMO_PASSWORD)
            set_session_key(db, key)  # the demo patient's own key, so their data is sealed like any patient's
            open_instance(existing, db)
            seal_user_data(db, existing, key)
            added = _add_followups(db, existing, key)
            db.commit()
            print(f"Demo user already exists: {DEMO_EMAIL}" + (f" (added {added} synthetic follow-up reports for trends)" if added else ""))
            return
        user = User(email=DEMO_EMAIL, full_name="Demo Patient (synthetic)", hashed_password=hash_password(DEMO_PASSWORD))
        user.profile = PatientProfile(
            date_of_birth=date(1974, 3, 15), sex="female", height_cm=158, weight_kg=74, blood_group="B+",
            activity_level="low", alcohol_use="none", allergies=["Penicillin"],
            chronic_conditions=[], current_medications=[], emergency_contact="Synthetic contact",
        )
        db.add(user)
        db.flush()
        key = ensure_user_key(user, DEMO_PASSWORD)
        set_session_key(db, key)
        user._bmc_legacy = {"full_name"}
        create_recovery_code(user, key)  # demo account: the code is not shown; reset it from the profile page
        db.add_all([
            MedicalHistoryEntry(user_id=user.id, category="condition", title="Family history of diabetes",
                                details="Mother has type 2 diabetes (synthetic example)."),
            MedicalHistoryEntry(user_id=user.id, category="allergy", title="Penicillin", details="Rash (synthetic example)."),
            MedicalHistoryEntry(user_id=user.id, category="vaccination", title="Influenza vaccine", event_date=date(2025, 10, 1)),
            MedicalHistoryEntry(user_id=user.id, category="visit", title="Annual check-up", event_date=date(2026, 9, 20),
                                details="Advised blood tests (synthetic example)."),
        ])
        _add_file(db, user, key, "synthetic_metabolic_panel.pdf", "report", "Metabolic panel (synthetic)", "blood_test", date(2026, 9, 22))
        _add_file(db, user, key, "synthetic_grayscale_image.png", "image", "Synthetic test image", "other", date(2026, 9, 22))
        _add_followups(db, user, key)
        db.commit()
        print(f"Created demo user {DEMO_EMAIL} / {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
