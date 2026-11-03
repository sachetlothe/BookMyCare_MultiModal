"""Report what is still readable WITHOUT the patient's own key (needs no keys, reveals no data).

    python -m scripts.check_sealing

For every user it counts: files that are plain or sealed only with the server key, plain
extracted report text, and plain values in sealed database fields. Everything listed here is
moved to the patient's own key automatically the next time that patient signs in.
Also lists files in UPLOAD_DIR that belong to no report.
"""
from __future__ import annotations

import sys

from sqlalchemy import inspect, select

from app.core.config import get_settings
from app.db.sealing import is_sealed
from app.db.session import engine
from app.models import Analysis, AuditLog, LabResult, MedicalHistoryEntry, MedicalReport, PatientProfile, User
from app.services.file_store import FileMissing, blob_version, get_file_store
from app.services.patient_keys import is_encrypted_text

MODELS = (User, PatientProfile, MedicalHistoryEntry, MedicalReport, Analysis, LabResult, AuditLog)


def _plain(value) -> bool:
    return value not in (None, [], {}, "") and not is_sealed(value)


def main() -> int:
    store = get_file_store()
    per_user: dict[int, dict[str, int]] = {}
    emails: dict[int, str] = {}
    known_files: set[str] = set()

    def bump(uid, what, n=1):
        per_user.setdefault(uid, {}).setdefault(what, 0)
        per_user[uid][what] += n

    with engine.connect() as c:  # raw rows: nothing is decrypted here
        for uid, email in c.execute(select(User.id, User.email)):
            emails[uid] = email
            per_user.setdefault(uid, {})
        for model in MODELS:
            owner = model.id if model is User else model.user_id
            cols = [inspect(model).columns[f] for f in model.__sealed__]
            for row in c.execute(select(owner, *cols)):
                n = sum(_plain(v) for v in row[1:])
                if n:
                    bump(row[0], f"plain {model.__tablename__} fields", n)
        for uid, name, text in c.execute(select(MedicalReport.user_id, MedicalReport.stored_filename, MedicalReport.extracted_text)):
            known_files.add(name)
            if text and not is_encrypted_text(text):
                bump(uid, "plain extracted text")
            try:
                v = blob_version(store.load_raw(name))
            except FileMissing:
                bump(uid, "missing files")
                continue
            if v == 0:
                bump(uid, "unencrypted files")
            elif v == 1:
                bump(uid, "files on the server key")

    open_items = 0
    print(f"{'user':<40} still readable without the patient's key")
    for uid, counts in sorted(per_user.items()):
        todo = {k: v for k, v in counts.items() if k != "missing files"}
        open_items += sum(todo.values())
        detail = ", ".join(f"{v} {k}" for k, v in counts.items()) or "nothing - fully sealed"
        print(f"{emails.get(uid, uid)!s:<40} {detail}")

    s = get_settings()
    orphans = sorted(p.name for p in s.upload_dir.iterdir() if p.is_file() and p.name not in known_files) if s.upload_dir.exists() else []
    if orphans:
        print(f"\n{len(orphans)} file(s) in {s.upload_dir} belong to no report:")
        for n in orphans:
            print("  ", n)
    print(f"\n{open_items} item(s) still readable without a patient key" + (" (sealed at each owner's next sign-in)" if open_items else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
