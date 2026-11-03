"""Per-patient file keys: only the patient can open their original reports.

* Each patient has a random 256-bit *file key*. Their files and extracted report text are
  encrypted with it.
* The file key is stored only *wrapped* (AES-GCM) with a key derived from the patient's
  password (scrypt, per-user salt). The database, the server's settings and the storage
  bucket together are not enough to open it: the password is needed.
* At sign-in the server unwraps the file key and puts it, encrypted with a key derived from
  JWT_SECRET, into the patient's access token (claim ``fk``). Each request from the patient
  can therefore decrypt their files; nobody without that token or the password can.

Recovery: the same file key is also wrapped with a one-time-shown *recovery code*
(``create_recovery_code``). With the code a patient who forgot their password can set a new
one and keep their data (``recover_user_key``). Without a password or the recovery code the
data cannot be opened by anyone - including BookMyCare's own team.
"""
from __future__ import annotations

import base64
import os
import secrets
from datetime import datetime, timezone

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from app.core.config import get_settings

SCRYPT_N = 2**14  # ~30-60 ms per sign-in; the password is also checked with bcrypt
_b64 = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")  # noqa: E731


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


class KeyUnavailable(Exception):
    """The patient's file key is not available in this request (sign in again)."""


def _kek(password: str, salt: bytes) -> bytes:
    return Scrypt(salt=salt, length=32, n=SCRYPT_N, r=8, p=1).derive(password.encode("utf-8"))


def _wrap(key: bytes, kek: bytes, user_id: int) -> str:
    nonce = os.urandom(12)
    return _b64(nonce + AESGCM(kek).encrypt(nonce, key, f"bmc-user-key:{user_id}".encode()))


def _unwrap(wrapped: str, kek: bytes, user_id: int) -> bytes:
    raw = _unb64(wrapped)
    return AESGCM(kek).decrypt(raw[:12], raw[12:], f"bmc-user-key:{user_id}".encode())


def ensure_user_key(user, password: str) -> bytes:
    """Return the patient's file key, creating it on first use. Call only after the password is verified.
    The caller commits the session."""
    if user.file_key_wrapped and user.file_key_salt:
        try:
            return _unwrap(user.file_key_wrapped, _kek(password, _unb64(user.file_key_salt)), user.id)
        except InvalidTag as exc:  # password verified but key does not open: data problem, never silently replace
            raise KeyUnavailable("Stored file key could not be opened") from exc
    key = os.urandom(32)
    salt = os.urandom(16)
    user.file_key_salt = _b64(salt)
    user.file_key_wrapped = _wrap(key, _kek(password, salt), user.id)
    return key


def rewrap_user_key(user, old_password: str, new_password: str) -> None:
    set_password_key(user, ensure_user_key(user, old_password), new_password)


# --------------------------------------------------------------------------- recovery code

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L


def _normalise_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch in _CODE_ALPHABET)


def new_recovery_code() -> str:
    """6 groups of 5 characters from a 31-symbol alphabet (~148 bits), e.g. ABCDE-FGHJK-..."""
    raw = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(30))
    return "-".join(raw[i:i + 5] for i in range(0, 30, 5))


def create_recovery_code(user, key: bytes) -> str:
    """Wrap the patient's file key with a new recovery code (replacing any older code). Show it once."""
    code = new_recovery_code()
    salt = os.urandom(16)
    user.recovery_key_salt = _b64(salt)
    user.recovery_key_wrapped = _wrap(key, _kek(_normalise_code(code), salt), user.id)
    user.recovery_created_at = datetime.now(timezone.utc)
    return code


def recover_user_key(user, code: str) -> bytes | None:
    """The file key if the recovery code is right, else None. Always does the same amount of work."""
    salt = _unb64(user.recovery_key_salt) if user is not None and user.recovery_key_salt else bytes(16)
    kek = _kek(_normalise_code(code), salt)
    if user is None or not user.recovery_key_wrapped:
        return None
    try:
        return _unwrap(user.recovery_key_wrapped, kek, user.id)
    except (InvalidTag, ValueError):
        return None


def set_password_key(user, key: bytes, new_password: str) -> None:
    """Re-wrap the file key with a (new) password."""
    salt = os.urandom(16)
    user.file_key_salt = _b64(salt)
    user.file_key_wrapped = _wrap(key, _kek(new_password, salt), user.id)


# --------------------------------------------------------------------------- token claim

def _token_key() -> bytes:
    secret = get_settings().jwt_secret.encode()
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"bookmycare-token-file-key").derive(secret)


def seal_for_token(key: bytes, user_id: int) -> str:
    nonce = os.urandom(12)
    return _b64(nonce + AESGCM(_token_key()).encrypt(nonce, key, f"bmc-token-fk:{user_id}".encode()))


def open_from_token(sealed: str | None, user_id: int) -> bytes | None:
    if not sealed:
        return None
    try:
        raw = _unb64(sealed)
        return AESGCM(_token_key()).decrypt(raw[:12], raw[12:], f"bmc-token-fk:{user_id}".encode())
    except (InvalidTag, ValueError):
        return None


# --------------------------------------------------------------------------- small text values

TEXT_PREFIX = "bmcenc:v2:"


def encrypt_text(text: str | None, key: bytes, context: str) -> str | None:
    if text is None:
        return None
    nonce = os.urandom(12)
    return TEXT_PREFIX + _b64(nonce + AESGCM(key).encrypt(nonce, text.encode("utf-8"), f"bmc-text:{context}".encode()))


def is_encrypted_text(value: str | None) -> bool:
    return bool(value) and value.startswith(TEXT_PREFIX)


def decrypt_text(value: str | None, key: bytes | None, context: str) -> str | None:
    """Plain (legacy) text is returned as is; encrypted text needs the patient's key."""
    if not is_encrypted_text(value):
        return value
    if key is None:
        return None
    raw = _unb64(value[len(TEXT_PREFIX):])
    try:
        return AESGCM(key).decrypt(raw[:12], raw[12:], f"bmc-text:{context}".encode()).decode("utf-8")
    except InvalidTag:
        return None
