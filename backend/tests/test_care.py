"""Specialty rules and nearby-facility search (OpenStreetMap HTTP stubbed: no network)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.services import facilities, specialty
from app.services.lab_catalog import CATALOG
from tests.conftest import upload

CONDITIONS = json.loads((Path(__file__).resolve().parents[1] / "app" / "data" / "conditions.json").read_text(encoding="utf-8"))["conditions"]


def _trend(code="hba1c", name="HbA1c", category="Diabetes", assessment="worsening", n=3, status="high", flags=()):
    return {"code": code, "name": name, "category": category, "assessment": assessment, "n": n,
            "latest": {"status": status}, "flags": [{"kind": k, "text": k} for k in flags],
            "summary": f"{name} rose from 6.1% to 7.1% over 1 year (3 results); latest is high."}


# --------------------------------------------------------------------------- specialty rules

def test_every_condition_has_a_valid_specialty_mapping():
    codes = set(specialty.specialties())
    data = specialty._data()
    assert {c["key"] for c in CONDITIONS} == set(data["conditions"])
    for key, m in data["conditions"].items():
        assert set(m["specialists"]) <= codes, key
    assert set(data["lab_categories"].values()) | set(data["lab_tests"].values()) <= codes
    assert set(data["lab_categories"]) <= {cat for _, cat, _ in CATALOG.values()}
    assert set(data["lab_tests"]) <= set(CATALOG)
    assert all("specialist" not in c for c in CONDITIONS)  # one source of truth: specialties.json


def test_condition_label_is_built_from_the_table():
    assert specialty.label_for_condition("type_2_diabetes") == "General physician / endocrinologist"
    assert specialty.label_for_condition("influenza") == "General physician"
    assert specialty.specialties_for_condition("hypertension") == ["general_physician", "cardiology"]


def test_condition_match_suggests_physician_then_specialist_with_reason():
    rec = specialty.recommend([{"key": "type_2_diabetes", "name": "Type 2 diabetes / prediabetes", "confidence": "high"}], "soon")
    codes = [i["code"] for i in rec["items"]]
    assert codes == ["general_physician", "endocrinology"]
    endo = rec["items"][1]
    assert endo["role"] == "specialist" and endo["when"]
    assert endo["reasons"] == [{"source": "condition", "text": "Possible Type 2 diabetes / prediabetes (high match)"}]
    assert rec["version"] == "specialty-rules-v1"


def test_worsening_trend_alone_suggests_the_matching_specialist():
    rec = specialty.recommend([], "routine", [_trend()])
    endo = next(i for i in rec["items"] if i["code"] == "endocrinology")
    assert endo["reasons"][0]["source"] == "trend" and "HbA1c rose" in endo["reasons"][0]["text"]
    assert rec["items"][0]["code"] == "general_physician"


def test_stable_or_single_trends_do_not_trigger():
    stable = _trend(assessment="stable", status="normal")
    single = _trend(assessment="single_result", n=1)
    assert specialty.recommend([], "routine", [stable, single])["items"] == []


def test_persistent_abnormal_trend_triggers_even_when_stable():
    rec = specialty.recommend([], "routine", [_trend(code="hemoglobin", name="Haemoglobin", category="Blood count",
                                                     assessment="stable", status="low", flags=("persistent",))])
    assert "haematology" in [i["code"] for i in rec["items"]]


def test_vital_sign_tests_use_their_own_mapping():
    rec = specialty.recommend([], "routine", [_trend(code="bp_systolic", name="Systolic BP", category="Vital signs")])
    assert "cardiology" in [i["code"] for i in rec["items"]]


def test_emergency_comes_first_and_low_confidence_extras_are_skipped():
    rec = specialty.recommend([
        {"key": "pneumonia", "name": "Pneumonia", "confidence": "moderate"},
        {"key": "migraine", "name": "Migraine", "confidence": "low"},
    ], "emergency")
    codes = [i["code"] for i in rec["items"]]
    assert codes[0] == "emergency" and "pulmonology" in codes and "neurology" not in codes


def test_reasons_from_several_sources_are_merged():
    rec = specialty.recommend([{"key": "type_2_diabetes", "name": "Diabetes", "confidence": "high"}], "routine", [_trend()])
    endo = next(i for i in rec["items"] if i["code"] == "endocrinology")
    assert {r["source"] for r in endo["reasons"]} == {"condition", "trend"}


# --------------------------------------------------------------------------- OpenStreetMap parsing

def _el(id_, name, lat, lon, kind="clinic", spec=None, type_="node", **extra):
    tags = {"amenity": kind, "name": name, **extra}
    if spec:
        tags["healthcare:speciality"] = spec
    el = {"type": type_, "id": id_, "tags": tags}
    if type_ == "node":
        el.update(lat=lat, lon=lon)
    else:
        el["center"] = {"lat": lat, "lon": lon}
    return el


def test_parse_element_reads_ways_and_drops_unsafe_links():
    f = facilities.parse_element(_el(7, "City Hospital", 18.52, 73.85, kind="hospital", type_="way",
                                     website="javascript:alert(1)", phone="+91 20 1234 5678;+91 98", emergency="yes",
                                     **{"addr:street": "FC Road", "addr:city": "Pune"}))
    assert f["id"] == "way/7" and f["lat"] == 18.52 and f["kind_label"] == "Hospital"
    assert f["website"] is None and f["phone"] == "+91 20 1234 5678" and f["emergency"] is True
    assert f["address"] == "FC Road, Pune" and f["osm_url"] == "https://www.openstreetmap.org/way/7"
    assert facilities.parse_element({"type": "node", "id": 1, "lat": 1, "lon": 1, "tags": {"amenity": "clinic"}}) is None  # no name
    assert facilities.parse_element({"type": "node", "id": 1, "lat": 1, "lon": 1, "tags": {"amenity": "pharmacy", "name": "X"}}) is None


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """No test reaches the real OpenStreetMap servers; tests stub the call they need."""
    def offline(*a, **k):
        raise facilities.FacilitySearchError("offline in tests")

    monkeypatch.setattr(facilities, "_http_get", offline)
    monkeypatch.setattr(facilities, "_http_post", offline)
    monkeypatch.setattr(facilities, "NOMINATIM_INTERVAL", 0)
    facilities.reset_state()
    yield
    facilities.reset_state()


@pytest.fixture
def overpass(monkeypatch):
    monkeypatch.setattr(get_settings(), "facility_sources", "overpass")
    calls = []
    elements = [
        _el(1, "Sugar Care Clinic", 18.521, 73.851, spec="endocrinology;diabetology"),
        _el(2, "Heart Clinic", 18.522, 73.852, spec="cardiology"),
        _el(3, "General Hospital", 18.530, 73.860, kind="hospital"),
        _el(4, "Corner Clinic", 18.520, 73.850),
        _el(4, "Corner Clinic", 18.520, 73.850),  # duplicate (node + way of the same place)
        _el(5, "Far Away Hospital", 19.5, 74.5, kind="hospital"),
    ]

    def fake_post(url, data):
        calls.append((url, data))
        return {"elements": elements}

    monkeypatch.setattr(facilities, "_http_post", fake_post)
    yield calls
    facilities.reset_state()


def test_search_filters_by_specialty_locally_and_sorts_listed_first(overpass):
    res = facilities.search(18.52049, 73.85071, 5, "endocrinology", user_id=1)
    names = [f["name"] for f in res["results"]]
    assert names == ["Sugar Care Clinic", "General Hospital", "Corner Clinic"]  # cardiology-only clinic left out
    assert [f["match"] for f in res["results"]] == ["listed", "hospital", "unknown"]
    assert all(f["verification"]["status"] == "map_listing" for f in res["results"])
    assert res["attribution"] == "© OpenStreetMap contributors"
    # only the rounded location and generic facility types are sent; never the specialty
    query = overpass[0][1]["data"]
    assert "18.52,73.85" in query and "18.52049" not in query
    assert "endocrin" not in query and "diabet" not in query


def test_search_uses_the_cache_and_limits_external_calls(overpass, monkeypatch):
    facilities.search(18.52, 73.85, 5, None, user_id=2)
    again = facilities.search(18.52, 73.85, 5, "cardiology", user_id=2)
    assert len(overpass) == 1 and again["cached"] is True
    monkeypatch.setattr(get_settings(), "facility_searches_per_10min", 1)
    with pytest.raises(facilities.FacilitySearchError) as exc:
        facilities.search(12.97, 77.59, 5, None, user_id=2)
    assert exc.value.kind == "rate_limited"


def test_emergency_search_keeps_hospitals_only(overpass):
    res = facilities.search(18.52, 73.85, 5, "emergency", user_id=3)
    assert [f["name"] for f in res["results"]] == ["General Hospital"]


def test_geocode_parses_and_caches(monkeypatch):
    facilities.reset_state()
    calls = []

    def fake_get(url, params):
        calls.append(params)
        return [{"display_name": "Kothrud, Pune, Maharashtra, India", "lat": "18.5074", "lon": "73.8077"}, {"bad": 1}]

    monkeypatch.setattr(facilities, "_http_get", fake_get)
    places = facilities.geocode("  Kothrud,   Pune ", user_id=4)
    assert places == [{"name": "Kothrud, Pune, Maharashtra, India", "lat": 18.5074, "lon": 73.8077}]
    assert calls[0]["q"] == "Kothrud, Pune" and calls[0]["countrycodes"] == "in"
    facilities.geocode("kothrud, pune", user_id=4)
    assert len(calls) == 1
    facilities.reset_state()


# --------------------------------------------------------------------------- API

def test_care_endpoints_require_sign_in(client):
    for path in ("/api/care/specialties", "/api/care/suggested", "/api/care/facilities?lat=1&lon=1", "/api/care/geocode?q=Pune"):
        assert client.get(path).status_code == 401


def test_suggested_is_empty_for_a_new_patient(client, auth):
    r = client.get("/api/care/suggested", headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == [] and body["based_on_analysis"] is None and body["note"]
    assert any(s["code"] == "endocrinology" for s in client.get("/api/care/specialties", headers=auth).json())


def test_analysis_includes_specialty_recommendations_and_suggested_uses_it(client, auth):
    client.put("/api/profile", headers=auth, json={"date_of_birth": "1974-03-15", "sex": "female"})
    rep = upload(client, auth, "synthetic_metabolic_panel.pdf").json()
    r = client.post("/api/analyses", headers=auth, json={
        "symptoms": ["fatigue", "excessive_thirst"], "duration_days": 30, "severity": "mild", "report_ids": [rep["id"]],
    })
    assert r.status_code == 201, r.text
    res = r.json()["result"]
    assert res["conditions"][0]["specialist"] == "General physician / endocrinologist"
    rec = res["care_plan"]["specialty_recommendations"]
    assert [i["code"] for i in rec["items"]][:2] == ["general_physician", "endocrinology"]

    sug = client.get("/api/care/suggested", headers=auth).json()
    assert sug["based_on_analysis"]["analysis_id"] == r.json()["id"]
    assert "endocrinology" in [i["code"] for i in sug["items"]]


def test_facilities_endpoint(client, auth, overpass, monkeypatch):
    r = client.get("/api/care/facilities?lat=18.52&lon=73.85&radius_km=5&specialty=endocrinology", headers=auth)
    assert r.status_code == 200 and r.json()["results"][0]["name"] == "Sugar Care Clinic"
    assert client.get("/api/care/facilities?lat=18.52&lon=73.85&specialty=astrology", headers=auth).status_code == 400
    assert client.get("/api/care/facilities?lat=99&lon=73.85", headers=auth).status_code == 422
    monkeypatch.setattr(get_settings(), "facility_search_enabled", False)
    r = client.get("/api/care/facilities?lat=18.52&lon=73.85", headers=auth)
    assert r.status_code == 503 and "turned off" in r.json()["detail"]


def test_busy_overpass_server_falls_back_to_the_next(monkeypatch):
    facilities.reset_state()
    monkeypatch.setattr(get_settings(), "facility_sources", "overpass")
    monkeypatch.setattr(get_settings(), "overpass_urls", "https://busy.example/api,https://ok.example/api")
    tried = []

    def fake_post(url, data):
        tried.append(url)
        if "busy" in url:
            raise facilities.FacilitySearchError("The map service is busy.", "rate_limited")
        return {"elements": [_el(1, "Corner Clinic", 18.52, 73.85)]}

    monkeypatch.setattr(facilities, "_http_post", fake_post)
    res = facilities.search(18.52, 73.85, 2, None, user_id=9)
    assert tried == ["https://busy.example/api", "https://ok.example/api"] and res["count"] == 1
    monkeypatch.setattr(facilities, "_http_post", lambda url, data: (_ for _ in ()).throw(facilities.FacilitySearchError("down")))
    with pytest.raises(facilities.FacilitySearchError, match="down"):
        facilities.search(10.0, 76.0, 2, None, user_id=9)
    facilities.reset_state()


# --------------------------------------------------------------------------- Nominatim source, fallback, saved results

def _nom(osm_id, name, lat, lon, type_="clinic", **extratags):
    return {"osm_type": "node", "osm_id": osm_id, "lat": str(lat), "lon": str(lon), "name": name, "category": "amenity",
            "type": type_, "extratags": extratags,
            "address": {"house_number": "12", "road": "FC Road", "suburb": "Shivajinagar", "city": "Pune", "postcode": "411005"}}


@pytest.fixture
def nominatim(monkeypatch):
    calls = []
    rows = {
        "hospital": [_nom(3, "General Hospital", 18.53, 73.86, "hospital", emergency="yes")],
        "clinic": [_nom(1, "Sugar Care Clinic", 18.521, 73.851, **{"healthcare:speciality": "endocrinology", "phone": "+91 20 5555 0000"})],
        "doctors": [_nom(4, "Dr. Corner", 18.520, 73.850, "doctors"), {"lat": "bad"}],
    }

    def fake_get(url, params):
        calls.append(params)
        return rows[params["q"]]

    monkeypatch.setattr(get_settings(), "facility_sources", "nominatim,overpass")
    monkeypatch.setattr(facilities, "_http_get", fake_get)
    return calls


def test_nominatim_source_sends_only_generic_words_in_a_bounded_box(nominatim):
    res = facilities.search(18.52049, 73.85071, 2, "endocrinology", user_id=20)
    assert res["via"] == "nominatim" and res["stale"] is False
    assert [f["name"] for f in res["results"]] == ["Sugar Care Clinic", "General Hospital", "Dr. Corner"]
    clinic = res["results"][0]
    assert clinic["match"] == "listed" and clinic["phone"] == "+91 20 5555 0000"
    assert clinic["address"] == "12 FC Road, Shivajinagar, Pune, 411005" and clinic["id"] == "node/1"
    assert res["results"][1]["emergency"] is True
    assert [c["q"] for c in nominatim] == ["hospital", "clinic", "doctors"]
    for c in nominatim:
        assert c["bounded"] == 1 and c["extratags"] == 1
        west, north, east, south = map(float, c["viewbox"].split(","))
        assert south < 18.52 < north and west < 73.85 < east
        assert abs((north - south) / 2 - 3 / 111) < 0.001  # 2 km + 1 km for the rounded centre
        assert "18.52049" not in c["viewbox"] and "endocrin" not in str(c)


def test_one_failed_nominatim_phrase_still_returns_the_others(nominatim, monkeypatch):
    ok = facilities._http_get

    def flaky(url, params):
        if params["q"] == "doctors":
            raise facilities.FacilitySearchError("busy", "rate_limited")
        return ok(url, params)

    monkeypatch.setattr(facilities, "_http_get", flaky)
    res = facilities.search(18.52, 73.85, 2, None, user_id=21)
    assert res["via"] == "nominatim" and {f["name"] for f in res["results"]} == {"Sugar Care Clinic", "General Hospital"}


def test_falls_back_to_overpass_when_nominatim_fails(monkeypatch):
    monkeypatch.setattr(get_settings(), "facility_sources", "nominatim,overpass")
    monkeypatch.setattr(facilities, "_http_post", lambda url, data: {"elements": [_el(1, "Corner Clinic", 18.52, 73.85)]})
    res = facilities.search(18.52, 73.85, 2, None, user_id=22)  # _http_get is offline (autouse fixture)
    assert res["via"] == "overpass" and res["results"][0]["name"] == "Corner Clinic"


def test_saved_results_are_shown_when_every_source_fails(nominatim, monkeypatch):
    first = facilities.search(18.52, 73.85, 2, None, user_id=23)
    # an hour later the fresh cache has expired and every server is down
    monkeypatch.setattr(facilities, "CACHE_TTL", 0)
    monkeypatch.setattr(facilities, "_http_get", lambda *a: (_ for _ in ()).throw(facilities.FacilitySearchError("down")))
    again = facilities.search(18.52, 73.85, 2, None, user_id=23)
    assert again["stale"] is True and again["cached"] is True and again["count"] == first["count"]
    monkeypatch.setattr(facilities, "STALE_TTL", 0)
    with pytest.raises(facilities.FacilitySearchError):  # nothing fresh, nothing saved: the last source's error
        facilities.search(18.52, 73.85, 2, None, user_id=23)
