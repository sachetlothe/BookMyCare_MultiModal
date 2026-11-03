"""Patient data is sealed with the patient's own key; recovery codes and password changes keep it."""
from __future__ import annotations

import io

import sqlalchemy as sa
from sqlalchemy import select

from app.core.rate_limit import get_login_limiter
from app.db.sealing import is_sealed, set_session_key
from app.db.session import SessionLocal, engine
from app.models import MedicalHistoryEntry, User
from app.services.patient_keys import ensure_user_key


def _reg(client, email, password="Password123", name="Asha Example"):
    r = client.post("/api/auth/register", json={"email": email, "full_name": name, "password": password})
    assert r.status_code == 201, r.text
    body = r.json()
    return body, {"Authorization": f"Bearer {body['access_token']}"}


def _raw(sql: str, **params) -> list:
    with engine.connect() as c:
        return c.execute(sa.text(sql), params).all()


def _fill(client, h):
    assert client.put("/api/profile", headers=h, json={
        "date_of_birth": "1980-01-01", "sex": "female", "height_cm": 160, "weight_kg": 60, "blood_group": "B+",
        "is_pregnant": False, "smoker": False, "alcohol_use": "none", "activity_level": "low",
        "allergies": ["Penicillin"], "chronic_conditions": ["Asthma"], "current_medications": ["Salbutamol"],
        "emergency_contact": "Ravi 98765",
    }).status_code == 200
    assert client.post("/api/history", headers=h, json={"category": "condition", "title": "Thyroid nodule", "details": "Seen by Dr Mehta"}).status_code == 201
    rid = client.post("/api/reports", headers=h, files={"file": ("cbc-asha.txt", io.BytesIO(b"Hemoglobin: 10.4 g/dL\nHbA1c: 6.9 %"), "text/plain")},
                      data={"kind": "report", "title": "Asha CBC", "report_date": "2026-05-01"}).json()["id"]
    aid = client.post("/api/analyses", headers=h, json={"symptoms": ["fatigue"], "symptom_text": "tired for weeks", "report_ids": [rid]}).json()["id"]
    return rid, aid


def test_database_rows_hold_only_ciphertext_but_the_patient_sees_plain_data(client):
    body, h = _reg(client, "sealed1@example.com")
    uid = body["user"]["id"]
    assert body["user"]["full_name"] == "Asha Example"
    rid, aid = _fill(client, h)

    dump = " ".join(str(v) for row in (
        _raw("select full_name from users where id=:u", u=uid)
        + _raw("select allergies, chronic_conditions, current_medications, emergency_contact from patient_profiles where user_id=:u", u=uid)
        + _raw("select title, details from medical_history where user_id=:u", u=uid)
        + _raw("select title, original_filename, lab_values, extracted_text from medical_reports where user_id=:u", u=uid)
        + _raw("select inputs, result from analyses where user_id=:u", u=uid)
        + _raw("select data from lab_results where user_id=:u", u=uid)
    ) for v in row)
    for secret in ("Asha", "Penicillin", "Asthma", "Salbutamol", "Ravi", "Thyroid", "Mehta", "cbc-asha", "10.4", "tired", "fatigue", "Hemoglobin"):
        assert secret not in dump, secret
    assert "bmcenc:f1:" in dump

    # ... while the patient's own requests read everything normally
    assert client.get("/api/auth/me", headers=h).json()["full_name"] == "Asha Example"
    assert client.get("/api/profile", headers=h).json()["allergies"] == ["Penicillin"]
    assert client.get("/api/history", headers=h).json()[0]["details"] == "Seen by Dr Mehta"
    rep = client.get(f"/api/reports/{rid}", headers=h).json()
    assert rep["title"] == "Asha CBC" and rep["original_filename"] == "cbc-asha.txt" and rep["lab_count"] == 2
    assert client.get("/api/reports", headers=h).json()[0]["title"] == "Asha CBC"
    assert client.get(f"/api/analyses/{aid}", headers=h).json()["result"]["symptoms"][0]["key"] == "fatigue"
    assert client.get("/api/analyses", headers=h).json()[0]["symptom_preview"]
    assert client.get("/api/trends/hba1c", headers=h).json()["latest"]["value"] == 6.9


def test_another_patients_key_or_no_key_cannot_open_the_data(client):
    body, h = _reg(client, "sealed2@example.com")
    _fill(client, h)
    _reg(client, "sealed2-other@example.com", "OtherPass123")
    with SessionLocal() as db:
        other = db.scalar(select(User).where(User.email == "sealed2-other@example.com"))
        set_session_key(db, ensure_user_key(other, "OtherPass123"))
        entry = db.scalar(select(MedicalHistoryEntry).where(MedicalHistoryEntry.user_id == body["user"]["id"]))
        assert is_sealed(entry.title)  # other patient's key does not open it
    with SessionLocal() as db:  # the team / a script without any key
        entry = db.scalar(select(MedicalHistoryEntry).where(MedicalHistoryEntry.user_id == body["user"]["id"]))
        assert is_sealed(entry.title) and is_sealed(entry.details)


def test_forgotten_password_recovery_keeps_all_data(client):
    get_login_limiter().reset()
    body, h = _reg(client, "forgot@example.com")
    code = body["recovery_code"]
    assert code and body["has_recovery_code"] is True
    rid, _ = _fill(client, h)
    original = client.get(f"/api/reports/{rid}/file", headers=h).content

    assert client.post("/api/auth/reset-password", json={"email": "forgot@example.com", "recovery_code": "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE-FFFFF",
                                                         "new_password": "BrandNew123"}).status_code == 400
    r = client.post("/api/auth/reset-password", json={"email": "forgot@example.com", "recovery_code": code.lower().replace("-", " "),
                                                      "new_password": "BrandNew123"})
    assert r.status_code == 200, r.text
    new_code = r.json()["recovery_code"]
    assert new_code and new_code != code
    h2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get(f"/api/reports/{rid}/file", headers=h2).content == original  # nothing lost
    assert client.get("/api/profile", headers=h2).json()["allergies"] == ["Penicillin"]
    assert client.get("/api/profile", headers=h).status_code == 401  # old sessions ended
    assert client.post("/api/auth/login", json={"email": "forgot@example.com", "password": "Password123"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "forgot@example.com", "password": "BrandNew123"}).status_code == 200
    # the used code no longer works
    assert client.post("/api/auth/reset-password", json={"email": "forgot@example.com", "recovery_code": code,
                                                         "new_password": "Another123"}).status_code == 400
    get_login_limiter().reset()


def test_reset_attempts_are_rate_limited(client):
    get_login_limiter().reset()
    _reg(client, "guess@example.com")
    for _ in range(get_login_limiter().max_per_account):
        assert client.post("/api/auth/reset-password", json={"email": "guess@example.com", "recovery_code": "AAAAA-BBBBB-CCCCC-DDDDD",
                                                             "new_password": "BrandNew123"}).status_code == 400
    assert client.post("/api/auth/reset-password", json={"email": "guess@example.com", "recovery_code": "AAAAA-BBBBB-CCCCC-DDDDD",
                                                         "new_password": "BrandNew123"}).status_code == 429
    get_login_limiter().reset()


def test_change_password_keeps_data_and_ends_other_sessions(client):
    get_login_limiter().reset()
    _, h = _reg(client, "change@example.com")
    rid, _ = _fill(client, h)
    assert client.post("/api/auth/change-password", headers=h, json={"current_password": "Wrong12345", "new_password": "Newer12345"}).status_code == 403
    r = client.post("/api/auth/change-password", headers=h, json={"current_password": "Password123", "new_password": "Newer12345"})
    assert r.status_code == 200
    h2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get(f"/api/reports/{rid}", headers=h).status_code == 401
    assert client.get(f"/api/reports/{rid}/file", headers=h2).status_code == 200
    login = client.post("/api/auth/login", json={"email": "change@example.com", "password": "Newer12345"})
    assert login.status_code == 200
    h3 = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/history", headers=h3).json()[0]["title"] == "Thyroid nodule"
    get_login_limiter().reset()


def test_new_recovery_code_needs_the_password_and_replaces_the_old_one(client):
    get_login_limiter().reset()
    body, h = _reg(client, "newcode@example.com")
    assert client.get("/api/auth/security", headers=h).json()["has_recovery_code"] is True
    assert client.post("/api/auth/recovery-code", headers=h, json={"password": "nope"}).status_code == 403
    r = client.post("/api/auth/recovery-code", headers=h, json={"password": "Password123"})
    assert r.status_code == 200 and r.json()["recovery_code"] != body["recovery_code"]
    old = client.post("/api/auth/reset-password", json={"email": "newcode@example.com", "recovery_code": body["recovery_code"], "new_password": "BrandNew123"})
    assert old.status_code == 400
    get_login_limiter().reset()


def test_sign_out_everywhere(client):
    _, h = _reg(client, "everywhere@example.com")
    assert client.post("/api/auth/logout-all", headers=h).status_code == 204
    r = client.get("/api/profile", headers=h)
    assert r.status_code == 401 and "session has ended" in r.json()["detail"]


def test_plain_rows_from_before_sealing_are_sealed_at_next_sign_in(client):
    body, _ = _reg(client, "legacyrows@example.com")
    uid = body["user"]["id"]
    with SessionLocal() as db:  # written without a key, as older versions did
        db.add(MedicalHistoryEntry(user_id=uid, category="medication", title="Metformin 500", details="since 2025"))
        db.commit()
    assert _raw("select title from medical_history where user_id=:u", u=uid)[0][0] == "Metformin 500"
    login = client.post("/api/auth/login", json={"email": "legacyrows@example.com", "password": "Password123"})
    assert login.status_code == 200
    raw_title = _raw("select title from medical_history where user_id=:u", u=uid)[0][0]
    assert raw_title.startswith("bmcenc:f1:")
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/history", headers=h).json()[0]["title"] == "Metformin 500"
