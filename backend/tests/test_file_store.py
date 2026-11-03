from __future__ import annotations

import io
import json

import httpx
import pytest

from app.core.config import get_settings
from app.models import MedicalReport
from app.services import file_store as fs
from tests.conftest import upload

KEY = fs._decode_key(fs.generate_key())


def _stored_blob(report_id: int) -> tuple[str, bytes]:
    from app.db.session import SessionLocal

    with SessionLocal() as db:
        name = db.get(MedicalReport, report_id).stored_filename
    return name, (get_settings().upload_dir / name).read_bytes()


def test_encrypt_round_trip_and_tamper_detection():
    blob = fs.encrypt(b"Hemoglobin 10.8 g/dL", "a.enc", KEY)
    assert blob.startswith(fs.MAGIC) and b"Hemoglobin" not in blob
    assert fs.decrypt(blob, "a.enc", KEY) == b"Hemoglobin 10.8 g/dL"
    # same plaintext encrypts differently each time (random nonce)
    assert fs.encrypt(b"x", "a.enc", KEY) != fs.encrypt(b"x", "a.enc", KEY)
    tampered = blob[:-1] + bytes([blob[-1] ^ 1])
    with pytest.raises(fs.FileUnreadable):
        fs.decrypt(tampered, "a.enc", KEY)
    with pytest.raises(fs.FileUnreadable):  # moved into another record's name
        fs.decrypt(blob, "b.enc", KEY)
    with pytest.raises(fs.FileUnreadable):  # wrong key
        fs.decrypt(blob, "a.enc", fs._decode_key(fs.generate_key()))


def test_bad_keys_are_rejected():
    with pytest.raises(RuntimeError):
        fs._decode_key("too-short")


def test_uploaded_files_are_encrypted_at_rest(client, auth):
    r = upload(client, auth, "synthetic_metabolic_panel.pdf", title="Sealed panel")
    assert r.status_code == 201
    body = r.json()
    assert body["lab_count"] > 5  # extraction still works on the plaintext in memory
    name, blob = _stored_blob(body["id"])
    assert name.endswith(".enc")
    assert fs.is_encrypted(blob) and b"%PDF" not in blob and b"HbA1c" not in blob
    # re-processing decrypts on the server and gives the same result
    again = client.post(f"/api/reports/{body['id']}/reprocess", headers=auth).json()
    assert again["lab_count"] == body["lab_count"]


def test_originals_can_be_hidden_from_patients_too(client, auth, monkeypatch):
    monkeypatch.setattr(get_settings(), "allow_file_download", False)
    rid = upload(client, auth, "synthetic_metabolic_panel.txt").json()["id"]
    detail = client.get(f"/api/reports/{rid}", headers=auth).json()
    assert detail["file_download_allowed"] is False
    r = client.get(f"/api/reports/{rid}/file", headers=auth)
    assert r.status_code == 403 and "sealed" in r.json()["detail"]


def test_download_when_allowed_returns_the_original(client, auth, allow_download):
    raw = b"Hemoglobin 13.1 g/dL\nGlucose 92 mg/dL\n"
    rid = client.post("/api/reports", headers=auth, files={"file": ("mine.txt", io.BytesIO(raw), "text/plain")}, data={"kind": "report"}).json()["id"]
    d = client.get(f"/api/reports/{rid}/file", headers=auth)
    assert d.status_code == 200 and d.content == raw
    assert d.headers["content-disposition"].startswith("attachment")


def test_delete_removes_the_ciphertext(client, auth):
    rid = upload(client, auth, "synthetic_metabolic_panel.txt").json()["id"]
    name, _ = _stored_blob(rid)
    assert client.delete(f"/api/reports/{rid}", headers=auth).status_code == 204
    assert not (get_settings().upload_dir / name).exists()


def test_legacy_plaintext_files_still_load(tmp_path):
    store = fs.FileStore(fs.LocalBackend(tmp_path), KEY)
    (tmp_path / "old.pdf").write_bytes(b"%PDF-1.4 legacy")
    assert store.load("old.pdf") == b"%PDF-1.4 legacy"
    store.save_server_sealed("old.pdf", b"%PDF-1.4 legacy")  # what scripts.encrypt_uploads does
    assert fs.blob_version((tmp_path / "old.pdf").read_bytes()) == 1
    assert store.load("old.pdf") == b"%PDF-1.4 legacy"
    patient = fs._decode_key(fs.generate_key())
    assert store.seal_for_patient("old.pdf", patient) is True  # done at the patient's next sign-in
    assert fs.blob_version((tmp_path / "old.pdf").read_bytes()) == 2
    assert store.load("old.pdf", patient) == b"%PDF-1.4 legacy"
    with pytest.raises(fs.PatientKeyRequired):
        store.load("old.pdf")


def test_local_backend_rejects_path_tricks(tmp_path):
    with pytest.raises(fs.StorageError):
        fs.LocalBackend(tmp_path).put("../escape.enc", b"x")


def _fake_supabase():
    objects: dict[str, bytes] = {}
    buckets: dict[str, dict] = {}
    seen_headers: list[httpx.Headers] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen_headers.append(req.headers)
        path = req.url.path.removeprefix("/storage/v1")
        if path.startswith("/bucket/"):
            b = buckets.get(path.split("/")[2])
            return httpx.Response(200, json=b) if b else httpx.Response(400, json={"error": "not found"})
        if path == "/bucket" and req.method == "POST":
            body = json.loads(req.content)
            buckets[body["id"]] = body
            return httpx.Response(200, json={"name": body["id"]})
        if path.startswith("/object/authenticated/"):
            key = path.removeprefix("/object/authenticated/")
            return httpx.Response(200, content=objects[key]) if key in objects else httpx.Response(400, json={"error": "not_found"})
        if path.startswith("/object/"):
            key = path.removeprefix("/object/")
            if req.method == "POST":
                objects[key] = req.content
                return httpx.Response(200, json={"Key": key})
            if req.method == "DELETE":
                objects.pop(key, None)
                return httpx.Response(200, json=[])
        return httpx.Response(500)

    return handler, objects, buckets, seen_headers


def test_supabase_backend_stores_only_ciphertext_in_a_private_bucket():
    handler, objects, buckets, seen = _fake_supabase()
    backend = fs.SupabaseBackend("https://proj.supabase.co", "sb_secret_test", "medical-files")
    backend.client = httpx.Client(transport=httpx.MockTransport(handler), headers=backend.client.headers)
    store = fs.FileStore(backend, KEY)

    patient = fs._decode_key(fs.generate_key())
    store.save("x.enc", b"chest x-ray bytes", patient)
    assert buckets["medical-files"]["public"] is False
    assert b"chest" not in objects["medical-files/x.enc"]
    assert store.load("x.enc", patient) == b"chest x-ray bytes"
    assert all(h["apikey"] == "sb_secret_test" for h in seen)
    store.delete("x.enc")
    with pytest.raises(fs.FileMissing):
        store.load("x.enc", patient)


def test_supabase_backend_refuses_a_public_bucket():
    handler, _, buckets, _ = _fake_supabase()
    buckets["medical-files"] = {"id": "medical-files", "public": True}
    backend = fs.SupabaseBackend("https://proj.supabase.co", "sb_secret_test", "medical-files")
    backend.client = httpx.Client(transport=httpx.MockTransport(handler), headers=backend.client.headers)
    with pytest.raises(fs.StorageError):
        fs.FileStore(backend, KEY).save("x.enc", b"data", KEY)
