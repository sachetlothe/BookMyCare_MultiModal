import io

import pytest

from app.services.extraction import tesseract_available


def test_upload_pdf_extracts_labs(client, auth):
    r = upload_ok(client, auth, "synthetic_metabolic_panel.pdf", title="Panel", report_date="2026-09-01")
    assert r["extraction_status"] == "done"
    assert r["extraction_method"] == "pdf_text"
    keys = {v["key"]: v for v in r["lab_values"]}
    assert keys["hba1c"]["status"] == "high"
    assert keys["hemoglobin"]["value"] == 10.8
    assert keys["bp_systolic"]["value"] == 142


def test_upload_text_and_list_detail_delete(client, auth, allow_download):
    r = upload_ok(client, auth, "synthetic_metabolic_panel.txt")
    rid = r["id"]
    listed = client.get("/api/reports", headers=auth).json()
    assert any(x["id"] == rid and x["lab_count"] > 5 for x in listed)
    detail = client.get(f"/api/reports/{rid}", headers=auth).json()
    assert "SYNTHETIC" in detail["extracted_text"]
    f = client.get(f"/api/reports/{rid}/file", headers=auth)
    assert f.status_code == 200 and b"HbA1c" in f.content
    assert client.post(f"/api/reports/{rid}/reprocess", headers=auth).status_code == 200
    assert client.delete(f"/api/reports/{rid}", headers=auth).status_code == 204
    assert client.get(f"/api/reports/{rid}", headers=auth).status_code == 404


@pytest.mark.skipif(not tesseract_available(), reason="Tesseract not installed")
def test_upload_scanned_image_ocr(client, auth):
    r = upload_ok(client, auth, "synthetic_fever_cbc_scan.png")
    assert r["extraction_method"] == "ocr"
    keys = {v["key"]: v for v in r["lab_values"]}
    assert keys["platelets"]["status"] == "low"


def test_upload_medical_image_quality_only(client, auth):
    r = upload_ok(client, auth, "synthetic_grayscale_image.png", kind="image", report_type="xray")
    assert r["kind"] == "image"
    assert r["extraction_method"] == "image_meta"
    assert r["image_features"]["width"] == 512
    assert r["lab_values"] == []
    assert client.get("/api/reports?kind=image", headers=auth).json()[0]["kind"] == "image"


def test_rejects_bad_files(client, auth):
    bad = client.post("/api/reports", headers=auth, files={"file": ("x.exe", io.BytesIO(b"MZ\x90\x00binary"))}, data={"kind": "report"})
    assert bad.status_code == 415
    fake_pdf = client.post("/api/reports", headers=auth, files={"file": ("a.pdf", io.BytesIO(b"not really a pdf \xff\xfe"))})
    assert fake_pdf.status_code == 415
    empty = client.post("/api/reports", headers=auth, files={"file": ("a.txt", io.BytesIO(b""))})
    assert empty.status_code == 400
    txt_as_image = client.post("/api/reports", headers=auth, files={"file": ("a.txt", io.BytesIO(b"hello"))}, data={"kind": "image"})
    assert txt_as_image.status_code == 415


def test_reports_are_private(client, auth):
    rid = upload_ok(client, auth, "synthetic_metabolic_panel.txt")["id"]
    other = client.post("/api/auth/register", json={"email": "mallory@example.com", "full_name": "Mallory", "password": "Password1"}).json()
    oh = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.get(f"/api/reports/{rid}", headers=oh).status_code == 404
    assert client.get(f"/api/reports/{rid}/file", headers=oh).status_code == 404


def upload_ok(client, headers, filename, **form):
    from tests.conftest import upload

    r = upload(client, headers, filename, **form)
    assert r.status_code == 201, r.text
    return r.json()
