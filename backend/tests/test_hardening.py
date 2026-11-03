"""Reliability, performance and security behaviour added during the hardening pass."""
from __future__ import annotations

import gzip
import io
import time

from PIL import Image

from app.core.config import get_settings
from app.services import extraction


def _post(client, headers, name, data, kind="report", ctype="application/octet-stream"):
    return client.post("/api/reports", headers=headers, files={"file": (name, io.BytesIO(data), ctype)}, data={"kind": kind})


def test_corrupted_pdf_is_saved_with_a_clear_failure(client, auth):
    r = _post(client, auth, "broken.pdf", b"%PDF-1.7\n this is not really a pdf \x00\x01\x02")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["extraction_status"] == "failed"
    assert "PDF" in body["extraction_error"]
    assert body["lab_values"] == []


def test_corrupted_image_upload_fails_cleanly(client, auth):
    r = _post(client, auth, "xray.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, kind="image")
    assert r.status_code == 201, r.text
    assert r.json()["extraction_status"] == "failed"


def test_empty_oversized_and_disguised_files_are_rejected(client, auth):
    assert _post(client, auth, "empty.pdf", b"").status_code == 400
    big = b"a" * (get_settings().max_upload_mb * 1024 * 1024 + 1)
    assert _post(client, auth, "big.txt", big, ctype="text/plain").status_code == 413
    # binary content renamed to .txt is not accepted as text
    assert _post(client, auth, "fake.txt", b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\xff\xff", ctype="text/plain").status_code == 415
    # a PDF cannot be uploaded as a medical image
    assert _post(client, auth, "scan.pdf", b"%PDF-1.4\n%%EOF", kind="image").status_code == 415


def test_decompression_bomb_is_rejected_without_crashing(monkeypatch):
    buf = io.BytesIO()
    Image.new("L", (300, 300), 128).save(buf, "PNG")
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1000)  # 300x300 now counts as a "bomb"
    res = extraction.extract(buf.getvalue(), "image/png", "image")
    assert res.status == "failed" and "too large" in res.error


def test_large_image_keeps_true_size_and_quality_stats():
    buf = io.BytesIO()
    Image.new("L", (3000, 2400), 120).save(buf, "PNG")
    feats = extraction.image_quality_features(buf.getvalue())
    assert (feats["width"], feats["height"]) == (3000, 2400)
    assert feats["mode"] == "L" and feats["format"] == "PNG"
    assert abs(feats["mean_brightness"] - 120) < 1


def test_list_pagination_is_optional_and_backward_compatible(client, auth):
    for i in range(3):
        assert _post(client, auth, f"r{i}.txt", f"Hemoglobin {12 + i} g/dL".encode(), ctype="text/plain").status_code == 201
    everything = client.get("/api/reports", headers=auth).json()
    assert len(everything) == 3
    page = client.get("/api/reports?limit=2", headers=auth).json()
    assert [r["id"] for r in page] == [r["id"] for r in everything[:2]]
    rest = client.get("/api/reports?limit=2&offset=2", headers=auth).json()
    assert [r["id"] for r in rest] == [everything[2]["id"]]
    assert client.get("/api/reports?limit=0", headers=auth).status_code == 422
    assert client.get("/api/analyses?limit=5", headers=auth).status_code == 200


def test_large_json_responses_are_gzipped(client, auth):
    rid = _post(client, auth, "long.txt", ("Hemoglobin 13 g/dL\n" * 400).encode(), ctype="text/plain").json()["id"]
    r = client.get(f"/api/reports/{rid}", headers={**auth, "Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers.get("content-encoding") == "gzip"
    assert "Hemoglobin" in r.json()["extracted_text"]  # client transparently decompresses
    assert gzip  # imported for clarity of intent


def test_login_does_not_reveal_whether_an_email_exists(client):
    client.post("/api/auth/register", json={"email": "timing@example.com", "full_name": "Timing User", "password": "Password123"})

    def timed(email):
        t = time.perf_counter()
        r = client.post("/api/auth/login", json={"email": email, "password": "WrongPass123"})
        return r, time.perf_counter() - t

    known, t_known = timed("timing@example.com")
    unknown, t_unknown = timed("no-such-user@example.com")
    assert known.status_code == unknown.status_code == 401
    assert known.json()["detail"] == unknown.json()["detail"]
    # both paths run bcrypt now; before the fix the unknown-email path was ~100x faster
    assert t_unknown > t_known * 0.3


def test_users_cannot_read_each_others_reports(client, auth):
    rid = _post(client, auth, "mine.txt", b"Hemoglobin 13 g/dL", ctype="text/plain").json()["id"]
    other = client.post("/api/auth/register", json={"email": "other-user@example.com", "full_name": "Other User", "password": "Password123"}).json()
    h2 = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.get(f"/api/reports/{rid}", headers=h2).status_code == 404
    assert client.get(f"/api/reports/{rid}/file", headers=h2).status_code == 404
    assert client.delete(f"/api/reports/{rid}", headers=h2).status_code == 404
    assert client.get("/api/reports", headers={"Authorization": "Bearer not-a-token"}).status_code == 401
