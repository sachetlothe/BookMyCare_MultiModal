"""Transparent per-patient encryption of sensitive model fields ("sealed" fields).

A model lists its sensitive attributes in ``__sealed__``. In the database those columns hold
only ciphertext (AES-256-GCM with the patient's own file key, see services/patient_keys):

* text columns:  "bmcenc:f1:<base64>"
* JSON columns:  {"$bmc": "bmcenc:f1:<base64>"}

The key lives in ``session.info[KEY]`` and is put there only for a signed-in patient's own
request (api/deps.get_current_user, the login route, seed scripts). With the key present:

* after rows are loaded or refreshed, sealed fields are decrypted in memory;
* before a flush, new or changed sealed fields are encrypted, and the plain values are put
  back in memory right after the flush, so application code only ever sees plain values.

Without the key (other patients' requests, the team, database tools, scripts) the values
stay ciphertext. The associated data binds each value to its table, field and owner, so a
value cannot be copied into another patient's row.

Values that are still plain in the database (written before sealing existed) are marked
on load and sealed the next time the owner signs in (services/patient_data.seal_user_data).
"""
from __future__ import annotations

import base64
import json
import logging
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import JSON, event, inspect
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified, get_history, set_committed_value

from app.db.base import Base

log = logging.getLogger("bookmycare.sealing")

KEY = "bmc_patient_key"
PREFIX = "bmcenc:f1:"
JSON_TAG = "$bmc"
_RESTORE = "_bmc_restore"


def set_session_key(db: Session, key: bytes | None) -> None:
    if key is None:
        db.info.pop(KEY, None)
    else:
        db.info[KEY] = key


def is_sealed(value) -> bool:
    return (isinstance(value, str) and value.startswith(PREFIX)) or (
        isinstance(value, dict) and len(value) == 1 and isinstance(value.get(JSON_TAG), str)
    )


def _owner(obj) -> int | None:
    return obj.id if obj.__tablename__ == "users" else getattr(obj, "user_id", None)


def _aad(obj, field: str) -> bytes:
    return f"bmc-field:{obj.__tablename__}.{field}:{_owner(obj)}".encode()


def _is_json(cls, field: str) -> bool:
    return isinstance(inspect(cls).columns[field].type, JSON)


def seal_value(obj, field: str, value, key: bytes):
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, json.dumps(value, ensure_ascii=False).encode("utf-8"), _aad(obj, field))
    token = PREFIX + base64.urlsafe_b64encode(nonce + ct).decode()
    return {JSON_TAG: token} if _is_json(type(obj), field) else token


def open_value(obj, field: str, sealed, key: bytes):
    token = sealed[JSON_TAG] if isinstance(sealed, dict) else sealed
    raw = base64.urlsafe_b64decode(token[len(PREFIX):])
    return json.loads(AESGCM(key).decrypt(raw[:12], raw[12:], _aad(obj, field)).decode("utf-8"))


def open_instance(obj, session: Session | None, only=None) -> None:
    """Decrypt the sealed fields of an already-loaded object (no-op without the key)."""
    fields = getattr(type(obj), "__sealed__", ())
    if not fields:
        return
    key = session.info.get(KEY) if session is not None else None
    legacy = set(getattr(obj, "_bmc_legacy", ()))
    for f in fields:
        if (only is not None and f not in only) or f not in obj.__dict__:
            continue
        v = obj.__dict__[f]
        if v is None:
            continue
        if is_sealed(v):
            if key is not None:
                try:
                    set_committed_value(obj, f, open_value(obj, f, v, key))
                except (InvalidTag, ValueError):
                    log.warning("Could not open %s.%s of owner %s", obj.__tablename__, f, _owner(obj))
        else:
            legacy.add(f)
    obj._bmc_legacy = legacy


def legacy_fields(obj) -> set[str]:
    return set(getattr(obj, "_bmc_legacy", ()))


def mark_for_sealing(obj) -> int:
    """Flag plain (legacy) fields as changed so the next flush seals them."""
    n = 0
    for f in legacy_fields(obj):
        if obj.__dict__.get(f) is not None:
            flag_modified(obj, f)
            n += 1
    return n


@event.listens_for(Base, "load", propagate=True)
def _on_load(target, context):
    open_instance(target, context.session)


@event.listens_for(Base, "refresh", propagate=True)
def _on_refresh(target, context, attrs):
    open_instance(target, context.session, attrs)


@event.listens_for(Session, "before_flush")
def _before_flush(session: Session, flush_context, instances):
    key = session.info.get(KEY)
    restore = session.info.setdefault(_RESTORE, [])
    for obj in list(session.new) + list(session.dirty):
        fields = getattr(type(obj), "__sealed__", ())
        is_new = obj in session.new
        for f in fields:
            if f not in obj.__dict__:
                continue
            v = obj.__dict__[f]
            if v is None or is_sealed(v):
                continue
            if not is_new and not get_history(obj, f).has_changes() and f not in legacy_fields(obj):
                continue
            if key is None:
                log.warning("No patient key in session: %s.%s written unsealed (sealed at next sign-in)", obj.__tablename__, f)
                continue
            if _owner(obj) is None:
                continue  # sealed on a later flush once the owner id exists
            setattr(obj, f, seal_value(obj, f, v, key))
            restore.append((obj, f, v))


@event.listens_for(Session, "after_flush_postexec")
def _after_flush(session: Session, flush_context):
    for obj, f, v in session.info.pop(_RESTORE, []):
        set_committed_value(obj, f, v)
        obj._bmc_legacy = legacy_fields(obj) - {f}
