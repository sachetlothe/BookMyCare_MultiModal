"""Encrypted storage for uploaded reports and medical images.

Every file is encrypted with AES-256-GCM *before* it leaves the server process, so the
stored bytes (on disk or in Supabase Storage) are unreadable without FILE_ENCRYPTION_KEY.
GCM also authenticates the data: a modified or swapped file fails to decrypt instead of
returning wrong content. The stored name is bound in as associated data, so one
patient's file cannot be renamed into another patient's record.

Stored format:  b"BMCE" | version (1 byte) | nonce (12 bytes) | ciphertext + 16-byte tag
  version 2  encrypted with the patient's own file key (see patient_keys): only the patient's
             signed-in requests can open it - not the team, the database or the server key alone
  version 1  encrypted with the server key FILE_ENCRYPTION_KEY (older uploads; moved to
             version 2 the next time the patient signs in)

Backends
  local     encrypted files in UPLOAD_DIR (default)
  supabase  encrypted objects in a private Supabase Storage bucket (shared by the team)
"""
from __future__ import annotations

import base64
import binascii
import logging
import os
import secrets
import threading
from functools import lru_cache
from pathlib import Path

import httpx
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import BACKEND_DIR, get_settings

log = logging.getLogger("bookmycare.files")

MAGIC = b"BMCE"
VERSION = 1  # server key
VERSION_PATIENT = 2  # patient's own key
_HEADER = len(MAGIC) + 1
_NONCE = 12
DEV_KEY_FILE = BACKEND_DIR / ".keys" / "file_encryption.key"


class FileMissing(Exception):
    """The stored object does not exist."""


class FileUnreadable(Exception):
    """The stored object exists but cannot be decrypted (wrong key or tampered)."""


class StorageError(Exception):
    """The storage backend failed (network, permissions, configuration)."""


class PatientKeyRequired(Exception):
    """The file is sealed with the patient's key, which this request does not have."""


def generate_key() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()


def _decode_key(value: str) -> bytes:
    try:
        raw = base64.urlsafe_b64decode(value.strip() + "=" * (-len(value.strip()) % 4))
    except (binascii.Error, ValueError) as exc:
        raise RuntimeError("FILE_ENCRYPTION_KEY is not valid base64") from exc
    if len(raw) != 32:
        raise RuntimeError("FILE_ENCRYPTION_KEY must decode to 32 bytes (generate one with: python -m scripts.encrypt_uploads --new-key)")
    return raw


def _load_key() -> bytes:
    s = get_settings()
    if s.file_encryption_key:
        return _decode_key(s.file_encryption_key)
    if s.environment.lower() not in ("development", "dev", "test"):
        raise RuntimeError("FILE_ENCRYPTION_KEY must be set outside development")
    # Development fallback: a key file next to the code, git-ignored. Losing it makes every
    # stored file unreadable, and teammates sharing Supabase Storage need the same key, so
    # set FILE_ENCRYPTION_KEY explicitly for any shared setup.
    if not DEV_KEY_FILE.exists():
        DEV_KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        DEV_KEY_FILE.write_text(generate_key(), encoding="utf-8")
        log.warning("FILE_ENCRYPTION_KEY is not set; created a development key at %s. Back it up.", DEV_KEY_FILE)
    return _decode_key(DEV_KEY_FILE.read_text(encoding="utf-8"))


def _aad(name: str, version: int = VERSION) -> bytes:
    return (b"bookmycare-file:" if version == VERSION else b"bookmycare-patient-file:") + name.encode()


def is_encrypted(blob: bytes) -> bool:
    return blob[:4] == MAGIC


def blob_version(blob: bytes) -> int:
    """0 = not encrypted, 1 = server key, 2 = patient key."""
    return blob[4] if is_encrypted(blob) and len(blob) > 4 else 0


def encrypt(data: bytes, name: str, key: bytes, version: int = VERSION) -> bytes:
    nonce = os.urandom(_NONCE)
    return MAGIC + bytes([version]) + nonce + AESGCM(key).encrypt(nonce, data, _aad(name, version))


def decrypt(blob: bytes, name: str, key: bytes) -> bytes:
    version = blob_version(blob)
    if version not in (VERSION, VERSION_PATIENT) or len(blob) < _HEADER + _NONCE + 16:
        raise FileUnreadable("Not a BookMyCare encrypted file")
    nonce = blob[_HEADER:_HEADER + _NONCE]
    try:
        return AESGCM(key).decrypt(nonce, blob[_HEADER + _NONCE:], _aad(name, version))
    except InvalidTag as exc:
        raise FileUnreadable("Decryption failed (wrong key or the file was modified)") from exc


# --------------------------------------------------------------------------- backends

class LocalBackend:
    def __init__(self, root: Path) -> None:
        self.root = root
        root.mkdir(parents=True, exist_ok=True)

    def _path(self, name: str) -> Path:
        p = (self.root / name).resolve()
        if p.parent != self.root.resolve():
            raise StorageError("Invalid stored file name")
        return p

    def put(self, name: str, blob: bytes) -> None:
        p = self._path(name)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_bytes(blob)
        tmp.replace(p)

    def get(self, name: str) -> bytes:
        try:
            return self._path(name).read_bytes()
        except FileNotFoundError as exc:
            raise FileMissing(name) from exc

    def delete(self, name: str) -> None:
        self._path(name).unlink(missing_ok=True)


class SupabaseBackend:
    """Private bucket via the Storage REST API, using the server-only secret key."""

    def __init__(self, url: str, key: str, bucket: str, timeout: float = 30.0) -> None:
        if not url or not key:
            raise RuntimeError("STORAGE_BACKEND=supabase needs SUPABASE_URL and SUPABASE_SECRET_KEY")
        self.base = url.rstrip("/") + "/storage/v1"
        self.bucket = bucket
        headers = {"apikey": key}
        if key.startswith("eyJ"):  # legacy JWT service_role key also needs a Bearer header
            headers["Authorization"] = f"Bearer {key}"
        self.client = httpx.Client(headers=headers, timeout=timeout)
        self._ready = False
        self._lock = threading.Lock()

    def _ensure_bucket(self) -> None:
        if self._ready:
            return
        with self._lock:
            if self._ready:
                return
            r = self.client.get(f"{self.base}/bucket/{self.bucket}")
            if r.status_code == 200:
                if r.json().get("public"):
                    raise StorageError(f"Supabase bucket '{self.bucket}' is public; make it private")
            elif r.status_code in (400, 404):
                c = self.client.post(f"{self.base}/bucket", json={"id": self.bucket, "name": self.bucket, "public": False})
                if c.status_code not in (200, 201, 409):
                    raise StorageError(f"Could not create bucket: HTTP {c.status_code}")
            else:
                raise StorageError(f"Supabase Storage error: HTTP {r.status_code}")
            self._ready = True

    def _obj(self, name: str) -> str:
        return f"{self.base}/object/{self.bucket}/{name}"

    def put(self, name: str, blob: bytes) -> None:
        self._ensure_bucket()
        r = self.client.post(self._obj(name), content=blob, headers={"Content-Type": "application/octet-stream", "x-upsert": "true"})
        if r.status_code not in (200, 201):
            raise StorageError(f"Upload to Supabase Storage failed: HTTP {r.status_code}")

    def get(self, name: str) -> bytes:
        self._ensure_bucket()
        r = self.client.get(f"{self.base}/object/authenticated/{self.bucket}/{name}")
        if r.status_code in (400, 404):
            raise FileMissing(name)
        if r.status_code != 200:
            raise StorageError(f"Download from Supabase Storage failed: HTTP {r.status_code}")
        return r.content

    def delete(self, name: str) -> None:
        self._ensure_bucket()
        r = self.client.delete(self._obj(name))
        if r.status_code not in (200, 204, 400, 404):
            raise StorageError(f"Delete from Supabase Storage failed: HTTP {r.status_code}")


# --------------------------------------------------------------------------- facade

class FileStore:
    def __init__(self, backend, key: bytes) -> None:
        self.backend = backend
        self._key = key

    @property
    def backend_name(self) -> str:
        return "supabase" if isinstance(self.backend, SupabaseBackend) else "local"

    def save(self, name: str, data: bytes, patient_key: bytes) -> None:
        """Store a patient's file sealed with their own key (version 2)."""
        self.backend.put(name, encrypt(data, name, patient_key, VERSION_PATIENT))

    def save_server_sealed(self, name: str, data: bytes) -> None:
        """Version 1, server key. Only for maintenance of files whose patient is not signed in."""
        self.backend.put(name, encrypt(data, name, self._key, VERSION))

    def load(self, name: str, patient_key: bytes | None = None) -> bytes:
        blob = self.backend.get(name)
        version = blob_version(blob)
        if version == 0:
            log.warning("Stored file %s is not encrypted yet", name)
            return blob
        if version == VERSION_PATIENT:
            if patient_key is None:
                raise PatientKeyRequired(name)
            return decrypt(blob, name, patient_key)
        return decrypt(blob, name, self._key)

    def seal_for_patient(self, name: str, patient_key: bytes) -> bool:
        """Move an older file (plain or server key) to the patient's key. True if it changed."""
        blob = self.backend.get(name)
        if blob_version(blob) == VERSION_PATIENT:
            return False
        plain = blob if blob_version(blob) == 0 else decrypt(blob, name, self._key)
        self.save(name, plain, patient_key)
        return True

    def load_raw(self, name: str) -> bytes:
        return self.backend.get(name)

    def save_raw(self, name: str, blob: bytes) -> None:
        self.backend.put(name, blob)

    def delete(self, name: str) -> None:
        self.backend.delete(name)


@lru_cache
def get_file_store() -> FileStore:
    s = get_settings()
    key = _load_key()
    if s.storage_backend.lower() == "supabase":
        backend = SupabaseBackend(s.supabase_url, s.supabase_secret_key, s.supabase_storage_bucket)
    else:
        backend = LocalBackend(s.upload_dir)
    return FileStore(backend, key)


def new_stored_name() -> str:
    """Random object name. No file extension: the content is ciphertext, not a PDF or image."""
    return f"{secrets.token_hex(16)}.enc"
