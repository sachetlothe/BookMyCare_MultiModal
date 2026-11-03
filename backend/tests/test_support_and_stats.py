"""Team can fix data (with consent) and run anonymous reports, without seeing data by default."""
from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models import StatCounter, SupportGrant, User


def _reg(client, email):
    r = client.post("/api/auth/register", json={"email": email, "full_name": "Asha Example", "password": "Password123"})
    assert r.status_code == 201, r.text
    return r.json()["user"]["id"], {"Authorization": f"Bearer {r.json()['access_token']}"}


def _staff(client, email="staff@example.com"):
    uid, _ = _reg(client, email)
    with SessionLocal() as db:
        db.execute(update(User).where(User.id == uid).values(role="staff"))
        db.commit()
    r = client.post("/api/auth/login", json={"email": email, "password": "Password123"})
    assert r.json()["user"]["role"] == "staff"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _upload(client, h, text=b"HbA1c: 7.1 %\nHemoglobin: 10.8 g/dL"):
    r = client.post("/api/reports", headers=h, files={"file": ("lab.txt", io.BytesIO(text), "text/plain")},
                    data={"kind": "report", "title": "Asha labs", "report_date": "2026-05-01"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_patient_can_correct_a_misread_value_and_trends_follow(client):
    _, h = _reg(client, "fixme@example.com")
    rid = _upload(client, h)
    r = client.patch(f"/api/reports/{rid}/labs/hba1c", headers=h, json={"value": 6.1})
    assert r.status_code == 200
    v = next(x for x in r.json()["lab_values"] if x["key"] == "hba1c")
    assert v["value"] == 6.1 and v["corrected"] is True and v["original_value"] == 7.1
    assert client.get("/api/trends/hba1c", headers=h).json()["latest"]["value"] == 6.1
    # a missed test can be added; impossible values are refused
    assert client.patch(f"/api/reports/{rid}/labs/tsh", headers=h, json={"value": 2.2}).status_code == 200
    assert client.patch(f"/api/reports/{rid}/labs/hba1c", headers=h, json={"value": 99}).status_code == 422
    log = client.get("/api/support-access", headers=h).json()["log"]
    assert log[0]["action"] == "lab_value_corrected" and "HbA1c" in log[1]["detail"]


def test_staff_cannot_see_patient_data_without_consent(client):
    pid, h = _reg(client, "private@example.com")
    _upload(client, h)
    sh = _staff(client, "staff1@example.com")
    assert client.get(f"/api/staff/patients/{pid}", headers=sh).status_code == 403
    assert client.get(f"/api/staff/patients/{pid}", headers=h).status_code == 403  # patients are not staff
    assert client.get("/api/staff/stats", headers=h).status_code == 403
    assert all(x["patient_id"] != pid for x in client.get("/api/staff/support-requests", headers=sh).json())


def test_consented_support_access_view_fix_audit_and_revoke(client):
    pid, h = _reg(client, "helpme@example.com")
    rid = _upload(client, h)
    client.post("/api/history", headers=h, json={"category": "medication", "title": "Metfromin", "details": "typo"})
    sh = _staff(client, "staff2@example.com")

    g = client.post("/api/support-access", headers=h, json={"hours": 2, "reason": "HbA1c looks wrong"})
    assert g.status_code == 201 and g.json()["active"] is True
    assert any(x["patient_id"] == pid and x["reason"] == "HbA1c looks wrong" for x in client.get("/api/staff/support-requests", headers=sh).json())

    view = client.get(f"/api/staff/patients/{pid}", headers=sh).json()
    assert view["patient"]["full_name"] == "Asha Example"
    labs = {v["key"]: v for v in view["reports"][0]["lab_values"]}
    assert labs["hba1c"]["value"] == 7.1 and "HbA1c" in labs["hba1c"]["raw"]
    assert "extracted_text" not in str(view) and "Original files" in view["not_available"]
    assert client.get(f"/api/reports/{rid}/file", headers=sh).status_code == 404  # never the original file

    fix = client.patch(f"/api/staff/patients/{pid}/reports/{rid}/labs/hba1c", headers=sh, json={"value": 6.9, "note": "checked with patient"})
    assert fix.status_code == 200 and fix.json()["previous"] == 7.1
    hid = view["history"][0]["id"]
    assert client.patch(f"/api/staff/patients/{pid}/history/{hid}", headers=sh, json={"title": "Metformin"}).status_code == 200
    assert client.get("/api/history", headers=h).json()[0]["title"] == "Metformin"
    assert client.get("/api/trends/hba1c", headers=h).json()["latest"]["value"] == 6.9

    log = client.get("/api/support-access", headers=h).json()["log"]
    actions = [e["action"] for e in log]
    assert actions[:3] == ["history_corrected", "lab_value_corrected", "support_viewed"]
    assert all(e["actor_role"] == "staff" for e in log[:3]) and "staff2@example.com" in log[1]["detail"]

    revoked = client.delete("/api/support-access", headers=h).json()
    assert revoked["active"] is False
    assert client.get(f"/api/staff/patients/{pid}", headers=sh).status_code == 403


def test_support_access_expires_and_the_key_copy_is_destroyed(client):
    pid, h = _reg(client, "expire@example.com")
    sh = _staff(client, "staff3@example.com")
    client.post("/api/support-access", headers=h, json={"hours": 1})
    with SessionLocal() as db:  # move the expiry into the past
        db.execute(update(SupportGrant).where(SupportGrant.user_id == pid).values(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
        db.commit()
    assert client.get(f"/api/staff/patients/{pid}", headers=sh).status_code == 403
    with SessionLocal() as db:
        assert db.scalar(select(SupportGrant).where(SupportGrant.user_id == pid)) is None


def test_a_tampered_grant_does_not_open_data(client):
    pid, h = _reg(client, "tamper@example.com")
    sh = _staff(client, "staff4@example.com")
    client.post("/api/support-access", headers=h, json={"hours": 1})
    with SessionLocal() as db:  # extending the expiry in the database breaks the binding
        db.execute(update(SupportGrant).where(SupportGrant.user_id == pid).values(expires_at=datetime.now(timezone.utc) + timedelta(days=30)))
        db.commit()
    assert client.get(f"/api/staff/patients/{pid}", headers=sh).status_code == 403


def test_anonymous_statistics_with_small_groups_hidden(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "stats_min_count", 2)
    for i in range(2):
        _, h = _reg(client, f"statsuser{i}@example.com")
        _upload(client, h)
        client.post("/api/analyses", headers=h, json={"symptoms": ["fatigue"]})
    sh = _staff(client, "staff5@example.com")
    body = client.get("/api/staff/stats", headers=sh).json()
    counters = {m["metric"]: m for m in body["counters"]}
    from app.services.stats import period

    abn = {r["dimension"]: r for r in counters["lab_abnormal"]["rows"] if r["period"] == period()}
    assert abn["hba1c:high"]["count"] >= 2
    assert "signups" in counters and "analyses" in counters
    with SessionLocal() as db:  # counters hold no user ids or free text
        cols = set(StatCounter.__table__.columns.keys())
        assert cols == {"id", "metric", "period", "dimension", "count"}
    # groups below the threshold are hidden
    monkeypatch.setattr(get_settings(), "stats_min_count", 10_000)
    hidden = client.get("/api/staff/stats", headers=sh).json()
    assert all(r["count"] is None and r["display"] == "<10000" for m in hidden["counters"] for r in m["rows"])
    assert hidden["totals"]["patients"] == "<10000"
