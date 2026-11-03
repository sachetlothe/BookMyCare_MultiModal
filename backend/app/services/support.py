"""Consented, time-limited support access, and the patient-visible audit log.

Who can open a patient's data during a support window? Only a signed-in staff member.

* Every staff member has an X25519 key pair. The private key is a sealed field of their own
  account, so it is readable only inside that staff member's own signed-in requests (their
  password unlocks it, exactly like a patient's data).
* When a patient allows support access (only their own request holds their key), the patient's
  key is encrypted separately to each staff member's public key (ephemeral X25519 + HKDF +
  AES-GCM), bound to patient, staff member and expiry time.
* The server's secrets (FILE_ENCRYPTION_KEY, JWT_SECRET), the database and the storage bucket
  together cannot open these copies. Revoking or expiry deletes every copy.
Every staff view and change goes to ``audit_logs`` (sealed with the patient's key).
"""
from __future__ import annotations

import base64
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.sealing import set_session_key
from app.db.session import SessionLocal
from app.models import AuditLog, SupportGrant, SupportGrantKey, User

MAX_HOURS = 72
_RAW = serialization.Encoding.Raw
_b64 = lambda b: base64.urlsafe_b64encode(b).decode()  # noqa: E731


class NoStaffAvailable(Exception):
    """No staff member has a key pair yet (they create one at their first sign-in as staff)."""


class NoActiveGrant(Exception):
    pass


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


# --------------------------------------------------------------------------- staff key pairs

def ensure_staff_keypair(user: User) -> bool:
    """Create the staff member's key pair if missing. Must run in their own signed-in session
    (the private key is a sealed field). Returns True if created."""
    if (user.role or "patient") != "staff" or user.staff_public_key:
        return False
    priv = X25519PrivateKey.generate()
    user.staff_private_key = _b64(priv.private_bytes(_RAW, serialization.PrivateFormat.Raw, serialization.NoEncryption()))
    user.staff_public_key = _b64(priv.public_key().public_bytes(_RAW, serialization.PublicFormat.Raw))
    return True


def drop_staff_keypair(user: User) -> None:
    user.staff_public_key = None
    user.staff_private_key = None


def _box_key(shared: bytes, eph_pub: bytes, staff_pub: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"bmc-support-box" + eph_pub + staff_pub).derive(shared)


def _aad(patient_id: int, staff_id: int, expires_at: datetime) -> bytes:
    return f"bmc-support:{patient_id}:{staff_id}:{_utc(expires_at).isoformat()}".encode()


def seal_to_staff(patient_key: bytes, staff_pub_b64: str, patient_id: int, staff_id: int, expires_at: datetime) -> str:
    staff_pub = base64.urlsafe_b64decode(staff_pub_b64)
    eph = X25519PrivateKey.generate()
    eph_pub = eph.public_key().public_bytes(_RAW, serialization.PublicFormat.Raw)
    k = _box_key(eph.exchange(X25519PublicKey.from_public_bytes(staff_pub)), eph_pub, staff_pub)
    nonce = os.urandom(12)
    return _b64(eph_pub + nonce + AESGCM(k).encrypt(nonce, patient_key, _aad(patient_id, staff_id, expires_at)))


def open_as_staff(sealed: str, staff_priv_b64: str, patient_id: int, staff_id: int, expires_at: datetime) -> bytes | None:
    try:
        raw = base64.urlsafe_b64decode(sealed)
        priv = X25519PrivateKey.from_private_bytes(base64.urlsafe_b64decode(staff_priv_b64))
        staff_pub = priv.public_key().public_bytes(_RAW, serialization.PublicFormat.Raw)
        eph_pub, nonce, ct = raw[:32], raw[32:44], raw[44:]
        k = _box_key(priv.exchange(X25519PublicKey.from_public_bytes(eph_pub)), eph_pub, staff_pub)
        return AESGCM(k).decrypt(nonce, ct, _aad(patient_id, staff_id, expires_at))
    except (InvalidTag, ValueError, TypeError):
        return None


# --------------------------------------------------------------------------- grants

def audit(db: Session, patient_id: int, actor: User | None, action: str, detail: str | None = None) -> None:
    """Record an action on a patient's data. ``db`` must hold the patient's key (detail is sealed)."""
    db.add(AuditLog(user_id=patient_id, actor_id=actor.id if actor else None,
                    actor_role=(actor.role if actor else "system") or "patient", action=action, detail=detail))


def grant(db: Session, user: User, key: bytes, hours: int, reason: str | None) -> SupportGrant:
    hours = max(1, min(int(hours), MAX_HOURS))
    staff = db.execute(select(User.id, User.staff_public_key).where(User.role == "staff", User.staff_public_key.is_not(None),
                                                                   User.id != user.id, User.is_active.is_(True))).all()
    if not staff:
        raise NoStaffAvailable()
    expires = now() + timedelta(hours=hours)
    db.execute(delete(SupportGrant).where(SupportGrant.user_id == user.id))
    g = SupportGrant(user_id=user.id, reason=(reason or "").strip()[:300] or None, expires_at=expires)
    db.add(g)
    db.flush()
    for sid, pub in staff:
        db.add(SupportGrantKey(grant_id=g.id, staff_id=sid, sealed_key=seal_to_staff(key, pub, user.id, sid, expires)))
    audit(db, user.id, user, "support_access_granted",
          f"Support access allowed for {hours} hour(s) to {len(staff)} support staff member(s)" + (f": {g.reason}" if g.reason else ""))
    return g


def revoke(db: Session, user: User) -> bool:
    n = db.execute(delete(SupportGrant).where(SupportGrant.user_id == user.id)).rowcount
    if n:
        audit(db, user.id, user, "support_access_revoked", "Support access withdrawn")
    return bool(n)


def active_grant(db: Session, user_id: int) -> SupportGrant | None:
    g = db.scalar(select(SupportGrant).where(SupportGrant.user_id == user_id))
    if g and _utc(g.expires_at) <= now():
        db.delete(g)  # expired: every sealed copy of the key is destroyed (cascade)
        db.commit()
        return None
    return g


def purge_expired(db: Session) -> int:
    n = db.execute(delete(SupportGrant).where(SupportGrant.expires_at <= now())).rowcount
    db.commit()
    return n


@contextmanager
def patient_session(patient_id: int, staff: User):
    """A database session that can read one patient's sealed data. Needs an active grant AND the
    signed-in staff member's private key (only present in their own request). Separate from the
    staff member's own session, so keys never mix."""
    db = SessionLocal()
    try:
        g = active_grant(db, patient_id)
        row = db.scalar(select(SupportGrantKey).where(SupportGrantKey.grant_id == g.id, SupportGrantKey.staff_id == staff.id)) if g else None
        priv = staff.staff_private_key
        key = open_as_staff(row.sealed_key, priv, patient_id, staff.id, g.expires_at) if row and isinstance(priv, str) and not priv.startswith("bmcenc:") else None
        if key is None:
            raise NoActiveGrant(patient_id)
        set_session_key(db, key)
        yield db
    finally:
        db.close()
