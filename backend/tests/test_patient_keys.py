"""Only the patient can open their original reports."""
from __future__ import annotations

import io

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import create_access_token, decode_token_payload
from app.db.session import SessionLocal
from app.models import MedicalReport, User
from app.services import file_store as fs
from app.services import patient_keys as pk
from app.services.file_store import get_file_store

RAW = b"SYNTHETIC REPORT\nPatient: Asha Example\nHemoglobin: 10.9 g/dL\nHbA1c: 6.8 %\n"


def _register(client, email, password="Password123"):
    r = client.post("/api/auth/register", json={"email": email, "full_name": "Key Test", "password": password})
    assert r.status_code == 201, r.text
    return r.json(), {"Authorization": f"Bearer {r.json()['access_token']}"}


def _upload(client, h, data=RAW, name="mine.txt"):
    r = client.post("/api/reports", headers=h, files={"file": (name, io.BytesIO(data), "text/plain")}, data={"kind": "report"})
    assert r.status_code == 201, r.text
    return r.json()


def _row(rid):
    with SessionLocal() as db:
        r = db.get(MedicalReport, rid)
        return r.user_id, r.stored_filename, r.extracted_text


def test_patient_can_open_their_own_original(client):
    _, h = _register(client, "owner1@example.com")
    rid = _upload(client, h)["id"]
    detail = client.get(f"/api/reports/{rid}", headers=h).json()
    assert detail["file_download_allowed"] is True
    assert "Asha Example" in detail["extracted_text"]
    f = client.get(f"/api/reports/{rid}/file", headers=h)
    assert f.status_code == 200 and f.content == RAW


def test_stored_data_cannot_be_opened_with_server_secrets_alone(client):
    _, h = _register(client, "owner2@example.com")
    rid = _upload(client, h)["id"]
    _, name, text = _row(rid)
    blob = (get_settings().upload_dir / name).read_bytes()
    assert fs.blob_version(blob) == 2 and b"Asha" not in blob
    # Everything on the server side (database row, file, FILE_ENCRYPTION_KEY, JWT_SECRET) is not enough:
    with pytest.raises(fs.PatientKeyRequired):
        get_file_store().load(name)
    with pytest.raises(fs.FileUnreadable):
        fs.decrypt(blob, name, get_file_store()._key)
    assert text.startswith(pk.TEXT_PREFIX) and "Asha" not in text
    # ... and a token the server mints itself carries no file key
    forged = {"Authorization": f"Bearer {create_access_token(_row(rid)[0])}"}
    assert client.get(f"/api/reports/{rid}/file", headers=forged).status_code == 401
    assert client.get(f"/api/reports/{rid}", headers=forged).status_code == 401


def test_other_patients_cannot_open_it(client):
    _, h1 = _register(client, "owner3@example.com")
    _, h2 = _register(client, "other3@example.com")
    rid = _upload(client, h1)["id"]
    assert client.get(f"/api/reports/{rid}/file", headers=h2).status_code == 404
    assert client.get(f"/api/reports/{rid}", headers=h2).status_code == 404
    # a valid file key from user 2 copied into a token for user 1 does not open user 1's key
    p2 = decode_token_payload(h2["Authorization"].split()[1])
    p1 = decode_token_payload(h1["Authorization"].split()[1])
    mixed = {"Authorization": f"Bearer {create_access_token(p1['sub'], p2['fk'])}"}
    assert client.get(f"/api/reports/{rid}/file", headers=mixed).status_code == 401


def test_sign_in_unlocks_the_same_key_and_old_tokens_must_sign_in_again(client):
    _, h = _register(client, "owner4@example.com")
    rid = _upload(client, h)["id"]
    login = client.post("/api/auth/login", json={"email": "owner4@example.com", "password": "Password123"})
    h_new = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get(f"/api/reports/{rid}/file", headers=h_new).content == RAW
    old = {"Authorization": f"Bearer {create_access_token(_row(rid)[0])}"}  # issued before file keys existed
    r = client.post("/api/reports", headers=old, files={"file": ("a.txt", io.BytesIO(b"HbA1c 6 %"), "text/plain")}, data={"kind": "report"})
    assert r.status_code == 401 and "sign in again" in r.json()["detail"]


def test_older_data_moves_to_the_patients_key_at_sign_in(client):
    _, h = _register(client, "owner5@example.com")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "owner5@example.com"))
        get_file_store().save_server_sealed("legacy-file.enc", RAW)  # uploaded before per-patient keys
        db.add(MedicalReport(user_id=user.id, kind="report", title="old", original_filename="old.txt", stored_filename="legacy-file.enc",
                             content_type="text/plain", size_bytes=len(RAW), extraction_status="done", extracted_text="Patient: Asha Example",
                             lab_values=[]))
        db.commit()
        rid = db.scalar(select(MedicalReport.id).where(MedicalReport.stored_filename == "legacy-file.enc"))
    assert client.post("/api/auth/login", json={"email": "owner5@example.com", "password": "Password123"}).status_code == 200
    _, name, text = _row(rid)
    assert fs.blob_version((get_settings().upload_dir / name).read_bytes()) == 2
    assert pk.is_encrypted_text(text)


def test_key_wrapping():
    class U:
        id = 9
        file_key_salt = None
        file_key_wrapped = None

    u = U()
    k = pk.ensure_user_key(u, "Password123")
    assert pk.ensure_user_key(u, "Password123") == k
    with pytest.raises(pk.KeyUnavailable):
        pk.ensure_user_key(u, "WrongPassword1")
    pk.rewrap_user_key(u, "Password123", "NewPassword456")
    assert pk.ensure_user_key(u, "NewPassword456") == k  # files stay readable after a password change
    sealed = pk.seal_for_token(k, 9)
    assert pk.open_from_token(sealed, 9) == k
    assert pk.open_from_token(sealed, 10) is None  # bound to the user id
    t = pk.encrypt_text("secret", k, "9:x")
    assert pk.decrypt_text(t, k, "9:x") == "secret"
    assert pk.decrypt_text(t, k, "9:y") is None and pk.decrypt_text(t, None, "9:x") is None


def test_requests_without_the_key_are_refused(client):
    _, h = _register(client, "owner6@example.com")
    from tests.conftest import upload

    img = upload(client, h, "synthetic_grayscale_image.png", kind="image").json()["id"]
    old = {"Authorization": f"Bearer {create_access_token(decode_token_payload(h['Authorization'].split()[1])['sub'])}"}
    r = client.post("/api/analyses", headers=old, json={"symptoms": ["cough"], "image_ids": [img]})
    assert r.status_code == 401 and "sign in again" in r.json()["detail"]  # no key: no access at all
