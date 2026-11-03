"""Give an existing account the staff role (or take it away). Staff can see anonymous team
statistics and, only while a patient allows support access, that patient's structured data.

    python -m scripts.make_staff someone@example.com
    python -m scripts.make_staff someone@example.com --remove
"""
from __future__ import annotations

import sys

from sqlalchemy import delete, func, select

from app.db.session import SessionLocal
from app.models import SupportGrantKey, User
from app.services.support import drop_staff_keypair


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    email, remove = argv[0].lower(), "--remove" in argv
    with SessionLocal() as db:
        user = db.scalar(select(User).where(func.lower(User.email) == email))
        if user is None:
            print("No account with that email. The person must register first.")
            return 1
        user.role = "patient" if remove else "staff"
        if remove:  # their key pair and every support copy sealed to it are destroyed
            drop_staff_keypair(user)
            db.execute(delete(SupportGrantKey).where(SupportGrantKey.staff_id == user.id))
        user.session_version = (user.session_version or 0) + 1  # new role takes effect at next sign-in
        db.commit()
        print(f"{email} is now {'a patient account' if remove else 'staff'}; they must sign in again.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
