"""Support access opens only with a signed-in staff member's own key; older data is counted once."""
from __future__ import annotations

import io
from datetime import datetime, timezone

import pytest
from sqlalchemy import delete, select, update

from app.db.sealing import is_sealed
from app.db.session import SessionLocal
from app.models import Analysis, MedicalReport, StatCounter, SupportGrant, SupportGrantKey, User
from app.services import stats, support
from scripts.make_staff import main as make_staff


def _reg(client, email):
    r = client.post("/api/auth/register", json={"email": email, "full_name": "Test Person", "password": "Password123"})
    assert r.status_code == 201, r.text
    return r.json()["user"]["id"], {"Authorization": f"Bearer {r.json()['access_token']}"}


def _login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "Password123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _make_staff(client, email):
    sid, _ = _reg(client, email)
    assert make_staff([email]) == 0
    return sid, _login(client, email)  # key pair is created at this sign-in


@pytest.fixture(autouse=True)
def _only_our_staff():
    """Other tests create staff too; keep each test's staff set explicit."""
    with SessionLocal() as db:
        db.execute(update(User).where(User.role == "staff").values(role="patient", staff_public_key=None, staff_private_key=None))
        db.execute(delete(SupportGrant))
        db.commit()
    yield


def test_staff_key_pair_is_sealed_with_the_staff_members_own_key(client):
    sid, _ = _make_staff(client, "kp-staff@example.com")
    with SessionLocal() as db:  # what the server / database sees
        u = db.get(User, sid)
        assert u.staff_public_key and is_sealed(u.staff_private_key)


def test_server_secrets_and_database_alone_cannot_open_a_support_grant(client):
    pid, h = _reg(client, "kp-patient@example.com")
    sid, sh = _make_staff(client, "kp-staff2@example.com")
    assert client.post("/api/support-access", headers=h, json={"hours": 2}).status_code == 201
    assert client.get(f"/api/staff/patients/{pid}", headers=sh).status_code == 200  # the signed-in staff member can
    with SessionLocal() as db:
        staff = db.get(User, sid)  # loaded without the staff member's own key, as anyone with DB access would
        assert is_sealed(staff.staff_private_key)
        with pytest.raises(support.NoActiveGrant):
            with support.patient_session(pid, staff):
                pass
        rows = db.scalars(select(SupportGrantKey)).all()
        assert len(rows) == 1 and rows[0].staff_id == sid
    assert not hasattr(support, "_support_key")  # no server-held key path exists any more


def test_only_staff_members_who_held_a_key_pair_at_grant_time_can_open(client):
    pid, h = _reg(client, "kp-patient3@example.com")
    _, sh1 = _make_staff(client, "kp-staff3a@example.com")
    client.post("/api/support-access", headers=h, json={"hours": 1})
    _, sh2 = _make_staff(client, "kp-staff3b@example.com")  # joined after the grant
    assert client.get(f"/api/staff/patients/{pid}", headers=sh1).status_code == 200
    assert client.get(f"/api/staff/patients/{pid}", headers=sh2).status_code == 403
    # granting again includes the new staff member
    client.post("/api/support-access", headers=h, json={"hours": 1})
    assert client.get(f"/api/staff/patients/{pid}", headers=sh2).status_code == 200


def test_no_staff_set_up_means_no_grant(client):
    _, h = _reg(client, "kp-lonely@example.com")
    r = client.post("/api/support-access", headers=h, json={"hours": 1})
    assert r.status_code == 409 and "No support staff" in r.json()["detail"]


def test_removing_a_staff_member_destroys_their_copies(client):
    pid, h = _reg(client, "kp-patient4@example.com")
    sid, _ = _make_staff(client, "kp-staff4@example.com")
    client.post("/api/support-access", headers=h, json={"hours": 1})
    assert make_staff(["kp-staff4@example.com", "--remove"]) == 0
    with SessionLocal() as db:
        assert db.scalars(select(SupportGrantKey).where(SupportGrantKey.staff_id == sid)).all() == []
        u = db.get(User, sid)
        assert u.role == "patient" and u.staff_public_key is None and u.staff_private_key is None


def _count(metric, dim, period):
    with SessionLocal() as db:
        return db.scalar(select(StatCounter.count).where(StatCounter.metric == metric, StatCounter.dimension == dim,
                                                         StatCounter.period == period)) or 0


def test_older_data_is_counted_once_in_the_month_it_happened(client):
    uid, h = _reg(client, "backfill@example.com")
    rid = client.post("/api/reports", headers=h, files={"file": ("a.txt", io.BytesIO(b"HbA1c: 8.2 %"), "text/plain")},
                      data={"kind": "report"}).json()["id"]
    aid = client.post("/api/analyses", headers=h, json={"symptoms": ["fatigue"], "report_ids": [rid]}).json()["id"]
    old = datetime(2025, 3, 15, tzinfo=timezone.utc)
    with SessionLocal() as db:  # pretend these were created before statistics existed
        db.execute(update(MedicalReport).where(MedicalReport.id == rid).values(stats_counted=False, created_at=old))
        db.execute(update(Analysis).where(Analysis.id == aid).values(stats_counted=False, created_at=old))
        db.execute(update(User).where(User.id == uid).values(stats_counted=False, created_at=old))
        db.commit()
        assert stats.pending(db)["files"] >= 1
    before = (_count("lab_abnormal", "hba1c:high", "2025-03"), _count("analyses", "soon", "2025-03") + _count("analyses", "routine", "2025-03"),
              _count("signups", "all", "2025-03"))
    _login(client, "backfill@example.com")
    after = (_count("lab_abnormal", "hba1c:high", "2025-03"), _count("analyses", "soon", "2025-03") + _count("analyses", "routine", "2025-03"),
             _count("signups", "all", "2025-03"))
    assert after == (before[0] + 1, before[1] + 1, before[2] + 1)
    _login(client, "backfill@example.com")  # never counted twice
    assert (_count("lab_abnormal", "hba1c:high", "2025-03"), _count("signups", "all", "2025-03")) == (after[0], after[2])
    with SessionLocal() as db:
        assert db.get(MedicalReport, rid).stats_counted and db.get(Analysis, aid).stats_counted


def test_live_counting_marks_rows_so_backfill_skips_them(client):
    _, h = _reg(client, "livecount@example.com")
    rid = client.post("/api/reports", headers=h, files={"file": ("b.txt", io.BytesIO(b"TSH: 9.1 mIU/L"), "text/plain")},
                      data={"kind": "report"}).json()["id"]
    with SessionLocal() as db:
        assert db.get(MedicalReport, rid).stats_counted is True
    n = _count("lab_abnormal", "tsh:high", stats.period())
    _login(client, "livecount@example.com")
    assert _count("lab_abnormal", "tsh:high", stats.period()) == n
