from __future__ import annotations

import io
import json
from datetime import date

import sqlalchemy as sa

from app.services.scoring import score_conditions
from app.services.trends import analyse_series, trend_signals


def _pts(*pairs):
    return [{"date": date.fromisoformat(d), "value": v, "report_id": i} for i, (d, v) in enumerate(pairs, 1)]


def _kinds(t):
    return {f["kind"] for f in t["flags"]}


# --------------------------------------------------------------------------- rules

def test_rising_hba1c_is_worsening_and_persistent():
    t = analyse_series("hba1c", _pts(("2025-09-15", 6.1), ("2026-03-12", 6.6), ("2026-09-22", 7.1)), "female")
    assert t["direction"] == "rising" and t["assessment"] == "worsening" and t["toward"] == "high"
    assert {"consistent", "persistent"} <= _kinds(t)
    assert t["change"] == 1.0 and t["n"] == 3
    assert "HbA1c rose from 6.1% to 7.1%" in t["summary"] and "latest is high" in t["summary"]
    assert 0.9 < t["slope_per_year"] < 1.1


def test_hemoglobin_dropping_below_range_is_new_abnormal():
    t = analyse_series("hemoglobin", _pts(("2026-01-10", 12.8), ("2026-06-01", 11.2)), "female")
    assert t["assessment"] == "worsening" and t["toward"] == "low"
    assert "new_abnormal" in _kinds(t)


def test_rapid_change_flag():
    t = analyse_series("hemoglobin", _pts(("2026-01-10", 13.5), ("2026-02-01", 10.4)), "female")
    assert "rapid_change" in _kinds(t)


def test_ldl_back_to_normal_is_improving():
    t = analyse_series("ldl", _pts(("2025-10-01", 165), ("2026-04-01", 142), ("2026-10-01", 118)), None)
    assert t["assessment"] == "improving" and t["toward"] == "high"
    assert "back_to_normal" in _kinds(t)


def test_normal_but_climbing_glucose_is_approaching_the_limit():
    t = analyse_series("glucose_fasting", _pts(("2025-10-01", 80), ("2026-04-01", 89), ("2026-10-01", 97)), None)
    assert t["latest"]["status"] == "normal"
    assert t["assessment"] == "approaching_limit" and t["toward"] == "high"


def test_small_changes_are_stable():
    t = analyse_series("tsh", _pts(("2026-01-01", 2.1), ("2026-07-01", 2.4)), None)
    assert t["direction"] == "stable" and t["assessment"] == "stable"


def test_single_result_and_same_day_duplicates():
    assert analyse_series("hba1c", _pts(("2026-01-01", 6.0)), None)["assessment"] == "single_result"
    t = analyse_series("hba1c", _pts(("2026-01-01", 6.0), ("2026-01-01", 6.2)), None)
    assert t["n"] == 1 and t["latest"]["value"] == 6.2  # later report on the same day wins


def test_sex_specific_ranges_are_applied_to_history():
    pts = _pts(("2026-01-01", 13.0), ("2026-06-01", 12.6))
    assert analyse_series("hemoglobin", pts, "male")["latest"]["status"] == "low"
    assert analyse_series("hemoglobin", pts, "female")["latest"]["status"] == "normal"


# --------------------------------------------------------------------------- scoring

def _diabetes(conds):
    return next(c for c in conds if c["key"] == "type_2_diabetes")


def test_worsening_trend_adds_explained_evidence():
    labs = [{"key": "hba1c", "value": 7.1, "status": "high", "ref_low": None, "ref_high": 5.6, "unit": "%"}]
    t = analyse_series("hba1c", _pts(("2025-09-15", 6.1), ("2026-03-12", 6.6), ("2026-09-22", 7.1)), "female")
    without = _diabetes(score_conditions([], labs, {}))
    with_trend = _diabetes(score_conditions([], labs, {}, trends=trend_signals([t])))
    trend_factors = [f for f in with_trend["factors"] if f["type"] == "trend"]
    assert trend_factors and trend_factors[0]["direction"] == "supports" and "HbA1c rose" in trend_factors[0]["label"]
    assert with_trend["evidence_points"] > without["evidence_points"]


def test_improving_trend_counts_against():
    labs = [{"key": "ldl", "value": 118, "status": "normal", "ref_low": None, "ref_high": 129, "unit": "mg/dL"},
            {"key": "total_cholesterol", "value": 230, "status": "high", "ref_low": None, "ref_high": 199, "unit": "mg/dL"}]
    t = analyse_series("ldl", _pts(("2025-10-01", 165), ("2026-04-01", 142), ("2026-10-01", 118)), None)
    conds = score_conditions([], labs, {}, trends=trend_signals([t]))
    lip = next(c for c in conds if c["key"] == "hyperlipidaemia")
    assert any(f["type"] == "trend" and f["direction"] == "against" for f in lip["factors"])


# --------------------------------------------------------------------------- API

def _upload(client, h, text: str, when: str):
    return client.post("/api/reports", headers=h, files={"file": ("labs.txt", io.BytesIO(text.encode()), "text/plain")},
                       data={"kind": "report", "report_date": when})


def test_trends_api_end_to_end(client, auth):
    for when, a1c, hb in (("2025-09-15", 6.1, 12.6), ("2026-03-12", 6.6, 11.9), ("2026-09-22", 7.1, 10.8)):
        assert _upload(client, auth, f"HbA1c: {a1c} %\nHemoglobin: {hb} g/dL\nTSH: 2.1 mIU/L", when).status_code == 201
    body = client.get("/api/trends", headers=auth).json()
    by = {t["code"]: t for t in body["tests"]}
    assert by["hba1c"]["n"] == 3 and by["hba1c"]["assessment"] == "worsening"
    assert by["hba1c"]["loinc"] == "4548-4" and by["hba1c"]["category"] == "Diabetes"
    assert body["needs_attention"] >= 1 and body["with_history"] >= 2
    assert body["tests"][0]["assessment"] == "worsening"  # most important first
    assert client.get("/api/trends/hba1c", headers=auth).json()["n"] == 3
    assert client.get("/api/trends/nonsense", headers=auth).status_code == 404

    # analysis uses the history even when only the latest report is selected
    rid = by["hba1c"]["points"][-1]["report_id"]
    res = client.post("/api/analyses", headers=auth, json={"symptoms": ["fatigue"], "report_ids": [rid]}).json()["result"]
    assert any(t["code"] == "hba1c" for t in res["trends"])
    assert res["data_completeness"]["lab_history"] is True
    diab = next(c for c in res["conditions"] if c["key"] == "type_2_diabetes")
    assert any(f["type"] == "trend" for f in diab["factors"])

    # changing a report date moves its point; deleting a report removes it
    first = by["hba1c"]["points"][0]["report_id"]
    assert client.patch(f"/api/reports/{first}", headers=auth, json={"report_date": "2025-01-05"}).status_code == 200
    assert client.get("/api/trends/hba1c", headers=auth).json()["points"][0]["date"] == "2025-01-05"
    assert client.patch(f"/api/reports/{first}", headers=auth, json={"report_date": "2999-01-01"}).status_code == 422
    assert client.delete(f"/api/reports/{first}", headers=auth).status_code == 204
    assert client.get("/api/trends/hba1c", headers=auth).json()["n"] == 2


def test_reprocess_keeps_one_row_per_test(client, auth):
    rid = _upload(client, auth, "HbA1c: 6.0 %", "2026-01-01").json()["id"]
    client.post(f"/api/reports/{rid}/reprocess", headers=auth)
    client.post(f"/api/reports/{rid}/reprocess", headers=auth)
    assert client.get("/api/trends/hba1c", headers=auth).json()["n"] == 1


def test_trends_are_private(client, auth):
    _upload(client, auth, "HbA1c: 6.0 %", "2026-01-01")
    other = client.post("/api/auth/register", json={"email": "trend-other@example.com", "full_name": "Other", "password": "Password123"}).json()
    oh = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.get("/api/trends", headers=oh).json()["tests"] == []
    assert client.get("/api/trends/hba1c", headers=oh).status_code == 404
    assert client.get("/api/trends").status_code == 401


def test_migration_backfills_existing_reports(tmp_path):
    from alembic import command
    from alembic.config import Config

    from app.db.migrate import BACKEND_DIR

    url = f"sqlite:///{(tmp_path / 'm.db').as_posix()}"
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "0002")
    eng = sa.create_engine(url)
    with eng.begin() as c:
        c.execute(sa.text("insert into users (id, email, full_name, hashed_password, is_active, created_at) values (1, 'a@b.c', 'A', 'x', 1, '2026-01-01')"))
        c.execute(sa.text(
            "insert into medical_reports (id, user_id, kind, title, original_filename, stored_filename, content_type, size_bytes, "
            "report_date, extraction_status, lab_values, created_at) values (1, 1, 'report', 't', 'f', 's', 'text/plain', 1, "
            "'2026-02-03', 'done', :labs, '2026-02-04')"),
            {"labs": '[{"key": "hba1c", "value": 6.4, "unit": "%", "ref_low": null, "ref_high": 5.6, "status": "high"}, {"key": "unknown_test", "value": 1}]'})
    command.upgrade(cfg, "head")
    with eng.connect() as c:
        rows = c.execute(sa.text("select test_code, data, test_date from lab_results")).all()  # 0005 moved values into data
        assert [(r[0], json.loads(r[1])["value"], json.loads(r[1])["status"], str(r[2])) for r in rows] == [("hba1c", 6.4, "high", "2026-02-03")]
        assert c.execute(sa.text("select loinc from lab_test_catalog where code = 'hba1c'")).scalar() == "4548-4"
    command.downgrade(cfg, "0002")
    eng.dispose()
