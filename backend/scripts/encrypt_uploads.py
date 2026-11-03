"""Encrypt uploaded files that were stored before encryption existed, and optionally
copy every file into the configured storage backend (e.g. Supabase Storage).

This script never needs (or gets) a patient's own key: plain files are sealed with the
server key and move to the patient's key at their next sign-in; files already sealed with a
patient's key are copied as ciphertext, byte for byte.

    python -m scripts.encrypt_uploads --new-key     # print a fresh FILE_ENCRYPTION_KEY
    python -m scripts.encrypt_uploads --dry-run     # show what would change
    python -m scripts.encrypt_uploads               # encrypt / copy for real

Files are read from the local UPLOAD_DIR and written through the active backend
(STORAGE_BACKEND). The local plaintext copy is removed only after the encrypted copy has
been written and read back successfully. Files on disk that no database row refers to are
listed, never deleted.
"""
from __future__ import annotations

import argparse
import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models import MedicalReport
from app.services.file_store import FileMissing, LocalBackend, generate_key, get_file_store, is_encrypted


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--new-key", action="store_true", help="print a new random key and exit")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.new_key:
        print(generate_key())
        return 0

    s = get_settings()
    store = get_file_store()
    local = LocalBackend(s.upload_dir)
    to_remote = store.backend_name != "local"
    print(f"Backend: {store.backend_name}{' (copying local files there)' if to_remote else ''}")

    done = skipped = missing = failed = 0
    with SessionLocal() as db:
        rows = db.execute(select(MedicalReport.id, MedicalReport.stored_filename)).all()
    known = {name for _, name in rows}
    for rid, name in rows:
        try:
            raw = local.get(name)
        except FileMissing:
            if to_remote:
                try:
                    store.load_raw(name)
                    skipped += 1  # already in the remote store
                    continue
                except Exception:
                    pass
            print(f"  report {rid}: file missing ({name})")
            missing += 1
            continue
        if is_encrypted(raw) and not to_remote:
            skipped += 1
            continue
        if args.dry_run:
            print(f"  report {rid}: would {'encrypt' if not is_encrypted(raw) else 'copy'} {name}")
            done += 1
            continue
        try:
            if is_encrypted(raw):
                store.save_raw(name, raw)  # ciphertext copied unchanged
                if store.load_raw(name) != raw:
                    raise RuntimeError("read-back mismatch")
            else:
                store.save_server_sealed(name, raw)
                if store.load(name) != raw:
                    raise RuntimeError("read-back mismatch")
            if to_remote:
                local.delete(name)
            done += 1
            print(f"  report {rid}: {'stored encrypted in ' + store.backend_name if to_remote else 'encrypted'}")
        except Exception as exc:  # keep going; report at the end
            failed += 1
            print(f"  report {rid}: FAILED - {type(exc).__name__}: {exc}")

    orphans = sorted(p.name for p in s.upload_dir.iterdir() if p.is_file() and p.name not in known and not p.name.endswith(".tmp"))
    print(f"Done: {done} {'to do' if args.dry_run else 'processed'}, {skipped} already done, {missing} missing, {failed} failed")
    if orphans:
        print(f"{len(orphans)} file(s) in {s.upload_dir} belong to no report (left untouched):")
        for n in orphans:
            print("  ", n)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
