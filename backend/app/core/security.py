from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import get_settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(subject: str | int, file_key_sealed: str | None = None, session_version: int = 0) -> str:
    """``file_key_sealed``: the patient's file key, already encrypted for the token (see patient_keys).
    ``session_version``: must match users.session_version, so password changes end older sessions."""
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {"sub": str(subject), "iat": now, "exp": now + timedelta(minutes=s.access_token_minutes), "sv": session_version}
    if file_key_sealed:
        payload["fk"] = file_key_sealed
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_token_payload(token: str) -> dict | None:
    s = get_settings()
    try:
        return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        return None


def decode_access_token(token: str) -> str | None:
    payload = decode_token_payload(token)
    return payload.get("sub") if payload else None
