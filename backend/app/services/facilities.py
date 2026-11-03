"""Nearby healthcare facilities and place-name search, both from OpenStreetMap data.

Sources (``FACILITY_SOURCES``, tried in order): Nominatim (three generic searches, "hospital", "clinic" and
"doctors", bounded to a box around the location; fast and reliable) and the Overpass API (more complete, but
public servers are often at capacity). If every source fails, results saved for the same area within the last
24 hours are returned and marked as saved (``stale``).

Privacy:
* Only a location rounded to 2 decimals (about 1 km) is sent to OpenStreetMap servers, and only
  the generic question "hospitals / clinics / doctors near here". The patient's condition or the
  wanted specialty is never sent: specialty filtering happens here, on the server.
* Locations and place names are not logged or stored; answers are cached in memory for an hour.

Trust: every result is a *map listing*. OpenStreetMap data is community-edited, so a listing does
not prove that a facility exists, is open, offers a specialty or employs qualified doctors.
Results are sorted by distance only, never ranked as "best".

Usage policies (https://operations.osmfoundation.org/policies/nominatim/ and the Overpass API
rules) ask for an identifying User-Agent, caching and low request rates; all three are applied.
"""
from __future__ import annotations

import math
import re
import threading
import time
from collections import deque

import httpx

from app.core.config import get_settings
from app.services.specialty import specialties

ATTRIBUTION = "© OpenStreetMap contributors"
ATTRIBUTION_URL = "https://www.openstreetmap.org/copyright"
VERIFICATION_LABEL = "Map listing (OpenStreetMap), not verified"
VERIFICATION_NOTE = ("Listings come from OpenStreetMap, a community-edited map. They do not confirm that a facility is open, "
                     "offers a specialty or employs registered doctors. Call ahead, and check a doctor's registration with the "
                     "National Medical Commission or your State Medical Council.")
PRIVACY_NOTE = ("Only your approximate location (rounded to about 1 km) was sent to OpenStreetMap. "
                "Your health information and the doctor type you chose were not sent.")

KIND_LABELS = {"hospital": "Hospital", "clinic": "Clinic", "doctors": "Doctor's practice", "doctor": "Doctor's practice",
               "centre": "Health centre"}
MATCH_RANK = {"listed": 0, "emergency": 0, "hospital": 1, "unknown": 2}

CACHE_TTL = 3600  # fresh answers are reused for an hour
STALE_TTL = 24 * 3600  # ...and shown, marked as saved, for a day when every source fails
NOMINATIM_INTERVAL = 1.0  # Nominatim usage policy: at most one request per second
NOMINATIM_PHRASES = ("hospital", "clinic", "doctors")
CACHE_MAX = 256
WINDOW = 600
MAX_RESULTS = 40


class FacilitySearchError(RuntimeError):
    """kind: disabled | rate_limited | unavailable | bad_request"""

    def __init__(self, message: str, kind: str = "unavailable") -> None:
        super().__init__(message)
        self.kind = kind


_lock = threading.Lock()
_cache: dict[tuple, tuple[float, object]] = {}
_hits: dict[int, deque[float]] = {}
_last_nominatim = [0.0]
_nominatim_lock = threading.Lock()


def reset_state() -> None:
    """Clear caches and rate-limit counters (tests)."""
    with _lock:
        _cache.clear()
        _hits.clear()
        _last_nominatim[0] = 0.0


# ----------------------------------------------------------------------------- HTTP (stubbed in tests)

def _headers() -> dict[str, str]:
    return {"User-Agent": get_settings().osm_user_agent, "Accept-Language": "en"}


def _http_post(url: str, data: dict) -> dict:
    try:
        r = httpx.post(url, data=data, headers=_headers(), timeout=20)
    except httpx.HTTPError as exc:
        raise FacilitySearchError("The map service could not be reached. Please try again later.") from exc
    if r.status_code in (429, 502, 503, 504):
        raise FacilitySearchError("The map service is busy. Please try again in a minute.", "rate_limited")
    if r.status_code >= 400:
        raise FacilitySearchError(f"The map service returned an error ({r.status_code}).")
    return r.json()


def _http_get(url: str, params: dict) -> list:
    try:
        r = httpx.get(url, params=params, headers=_headers(), timeout=15)
    except httpx.HTTPError as exc:
        raise FacilitySearchError("The place search service could not be reached. Please try again later.") from exc
    if r.status_code == 429:
        raise FacilitySearchError("The place search service is busy. Please try again in a minute.", "rate_limited")
    if r.status_code >= 400:
        raise FacilitySearchError(f"The place search service returned an error ({r.status_code}).")
    return r.json()


# ----------------------------------------------------------------------------- cache and limits

def _cached(key: tuple, max_age: float | None = None):
    max_age = CACHE_TTL if max_age is None else max_age
    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < max_age:
            return hit[1]
    return None


def _store(key: tuple, value) -> None:
    with _lock:
        if len(_cache) >= CACHE_MAX:
            _cache.pop(min(_cache, key=lambda k: _cache[k][0]))
        _cache[key] = (time.monotonic(), value)


def _count_external_call(user_id: int) -> None:
    limit = get_settings().facility_searches_per_10min
    now = time.monotonic()
    with _lock:
        q = _hits.setdefault(user_id, deque())
        while q and q[0] <= now - WINDOW:
            q.popleft()
        if len(q) >= limit:
            raise FacilitySearchError("Too many searches. Please wait a few minutes and try again.", "rate_limited")
        q.append(now)


def _enabled() -> None:
    if not get_settings().facility_search_enabled:
        raise FacilitySearchError("Nearby facility search is turned off on this server.", "disabled")


def _nominatim_get(params: dict) -> list:
    with _nominatim_lock:  # Nominatim allows at most one request per second
        wait = NOMINATIM_INTERVAL - (time.monotonic() - _last_nominatim[0])
        if wait > 0:
            time.sleep(wait)
        try:
            return _http_get(get_settings().nominatim_url, params)
        finally:
            _last_nominatim[0] = time.monotonic()


def _try_each(calls, what: str):
    """Run calls in order and return the first success; raise the last error if all fail."""
    last: FacilitySearchError | None = None
    for call in calls:
        try:
            return call()
        except FacilitySearchError as exc:
            last = exc
    raise last or FacilitySearchError(f"No {what} is configured.", "disabled")


def _from_overpass(lat: float, lon: float, radius_km: float) -> list[dict]:
    query = build_query(lat, lon, int(radius_km * 1000))
    data = _try_each([lambda u=u: _http_post(u, {"data": query}) for u in get_settings().overpass_url_list], "Overpass server")
    return data.get("elements", []) if isinstance(data, dict) else []


def _nominatim_element(row: dict) -> dict | None:
    """A Nominatim result in the same shape as an Overpass element, so one parser handles both."""
    try:
        lat, lon = float(row["lat"]), float(row["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    tags = {k: v for k, v in (row.get("extratags") or {}).items() if isinstance(v, str)}
    if row.get("category") in ("amenity", "healthcare"):
        tags[row["category"]] = str(row.get("type", ""))
    if row.get("name"):
        tags.setdefault("name", str(row["name"]))
    a = row.get("address") or {}
    for dst, *srcs in (("addr:housenumber", "house_number"), ("addr:street", "road"), ("addr:postcode", "postcode"),
                       ("addr:suburb", "suburb", "neighbourhood", "residential"), ("addr:city", "city", "town", "village")):
        v = next((a[s] for s in srcs if a.get(s)), None)
        if v:
            tags.setdefault(dst, str(v))
    return {"type": row.get("osm_type") or "node", "id": row.get("osm_id"), "lat": lat, "lon": lon, "tags": tags}


def _from_nominatim(lat: float, lon: float, radius_km: float) -> list[dict]:
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.1))
    base = {"format": "jsonv2", "limit": 40, "bounded": 1, "extratags": 1, "addressdetails": 1,
            "viewbox": f"{lon - dlon:.4f},{lat + dlat:.4f},{lon + dlon:.4f},{lat - dlat:.4f}"}
    elements: list[dict] = []
    errors: list[FacilitySearchError] = []
    for phrase in NOMINATIM_PHRASES:
        try:
            rows = _nominatim_get({**base, "q": phrase})
        except FacilitySearchError as exc:
            errors.append(exc)
            continue
        elements += [e for e in map(_nominatim_element, rows if isinstance(rows, list) else []) if e]
    if len(errors) == len(NOMINATIM_PHRASES):
        raise errors[-1]
    return elements


SOURCES = {"nominatim": _from_nominatim, "overpass": _from_overpass}


def _fetch_elements(lat: float, lon: float, radius_km: float) -> tuple[list[dict], str]:
    names = [n for n in get_settings().facility_source_list if n in SOURCES]
    return _try_each([lambda n=n: (SOURCES[n](lat, lon, radius_km), n) for n in names], "map data source")


# ----------------------------------------------------------------------------- parsing helpers

def round_coord(v: float) -> float:
    return round(v, 2)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def build_query(lat: float, lon: float, radius_m: int) -> str:
    # Kept small (one filter, short timeout): busy public servers refuse or time out on heavier queries.
    return (f"[out:json][timeout:15];nwr(around:{radius_m},{lat},{lon})"
            '[amenity~"^(hospital|clinic|doctors)$"];out center tags 300;')


_PHONE_OK = re.compile(r"^[0-9+()\-\s]{5,25}$")


def _first(tags: dict, *names: str) -> str | None:
    for n in names:
        v = (tags.get(n) or "").strip()
        if v:
            return v
    return None


def parse_element(el: dict) -> dict | None:
    tags = el.get("tags") or {}
    name = _first(tags, "name:en", "name")
    lat = el.get("lat", (el.get("center") or {}).get("lat"))
    lon = el.get("lon", (el.get("center") or {}).get("lon"))
    if not name or lat is None or lon is None:
        return None
    kind = tags.get("amenity") if tags.get("amenity") in ("hospital", "clinic", "doctors") else tags.get("healthcare")
    if kind not in KIND_LABELS:
        return None
    kind = "doctors" if kind == "doctor" else kind
    specialities = sorted({s.strip().lower() for s in (tags.get("healthcare:speciality") or "").split(";") if s.strip()})

    address = _first(tags, "addr:full")
    if not address:
        street = " ".join(x for x in (tags.get("addr:housenumber"), tags.get("addr:street")) if x)
        parts = [street, _first(tags, "addr:suburb", "addr:neighbourhood"), _first(tags, "addr:city", "addr:district"),
                 tags.get("addr:postcode")]
        address = ", ".join(p for p in parts if p) or None

    phone = _first(tags, "phone", "contact:phone", "contact:mobile")
    phone = phone.split(";")[0].strip() if phone else None
    if phone and not _PHONE_OK.match(phone):
        phone = None
    website = _first(tags, "website", "contact:website")
    if website and not website.lower().startswith(("http://", "https://")):  # never pass javascript:/data: links on
        website = None

    return {
        "id": f"{el.get('type', 'node')}/{el.get('id')}",
        "name": name[:200],
        "kind": kind,
        "kind_label": KIND_LABELS[kind],
        "lat": float(lat),
        "lon": float(lon),
        "specialities": specialities,
        "address": address,
        "phone": phone,
        "website": website,
        "opening_hours": tags.get("opening_hours"),
        "emergency": tags.get("emergency") == "yes",
        "osm_url": f"https://www.openstreetmap.org/{el.get('type', 'node')}/{el.get('id')}",
    }


def _match(f: dict, code: str | None) -> tuple[str, str] | None:
    """(match kind, text) for a facility and the wanted specialty, or None to leave it out."""
    if code is None:
        return "unknown", ", ".join(f["specialities"]) if f["specialities"] else "Specialties not listed in map data"
    sp = specialties()[code]
    if code == "emergency":
        if f["emergency"]:
            return "emergency", "Emergency services listed in map data"
        if f["kind"] == "hospital":
            return "hospital", "Hospital; emergency services not listed in map data, call ahead"
        return None
    if set(sp["osm"]) & set(f["specialities"]):
        return "listed", f"{sp['name']} listed in map data"
    if f["kind"] == "hospital":
        return "hospital", f"Hospital; check whether it offers {sp['name'].lower()}"
    if not f["specialities"]:
        return "unknown", "Specialty not listed in map data"
    if code == "general_physician" and f["kind"] == "clinic":
        return "unknown", "Specialty listed as " + ", ".join(f["specialities"])
    return None  # a practice that lists only other specialties


# ----------------------------------------------------------------------------- public API

def search(lat: float, lon: float, radius_km: float, specialty_code: str | None, user_id: int) -> dict:
    _enabled()
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise FacilitySearchError("Invalid location.", "bad_request")
    if specialty_code is not None and specialty_code not in specialties():
        raise FacilitySearchError("Unknown specialty.", "bad_request")
    radius_km = min(max(radius_km, 0.5), get_settings().facility_max_radius_km)

    lat_r, lon_r = round_coord(lat), round_coord(lon)
    query_radius_km = radius_km + 1.0  # +1 km covers the rounding of the centre
    key = ("facilities", lat_r, lon_r, query_radius_km)
    hit = _cached(key)
    cached, stale = hit is not None, False
    if hit is None:
        _count_external_call(user_id)
        try:
            hit = _fetch_elements(lat_r, lon_r, query_radius_km)
            _store(key, hit)
        except FacilitySearchError:
            hit = _cached(key, STALE_TTL)
            if hit is None:
                raise
            cached, stale = True, True
    elements, via = hit

    seen: set[tuple] = set()
    results = []
    for el in elements:
        f = parse_element(el)
        if f is None:
            continue
        dedupe = (f["name"].lower(), round(f["lat"], 3), round(f["lon"], 3))
        if dedupe in seen:
            continue
        seen.add(dedupe)
        f["distance_km"] = round(haversine_km(lat, lon, f["lat"], f["lon"]), 2)
        if f["distance_km"] > radius_km:
            continue
        m = _match(f, specialty_code)
        if m is None:
            continue
        f["match"], f["match_text"] = m
        f["verification"] = {"status": "map_listing", "label": VERIFICATION_LABEL}
        results.append(f)

    results.sort(key=lambda f: (MATCH_RANK[f["match"]], f["distance_km"]))
    return {
        "source": "openstreetmap",
        "via": via,
        "stale": stale,
        "specialty": specialty_code,
        "radius_km": radius_km,
        "count": len(results[:MAX_RESULTS]),
        "results": results[:MAX_RESULTS],
        "cached": cached,
        "attribution": ATTRIBUTION,
        "attribution_url": ATTRIBUTION_URL,
        "verification_note": VERIFICATION_NOTE,
        "privacy_note": PRIVACY_NOTE,
    }


def geocode(query: str, user_id: int) -> list[dict]:
    """Place-name search: 'Kothrud, Pune' -> up to 5 candidate places."""
    _enabled()
    q = " ".join(query.split())
    if not 2 <= len(q) <= 120:
        raise FacilitySearchError("Enter a place name between 2 and 120 characters.", "bad_request")
    s = get_settings()
    key = ("nominatim", q.lower(), s.geocode_country_codes)
    hit = _cached(key)
    if hit is not None:
        return hit
    _count_external_call(user_id)
    params = {"q": q, "format": "jsonv2", "limit": 5}
    if s.geocode_country_codes:
        params["countrycodes"] = s.geocode_country_codes
    rows = _nominatim_get(params)
    places = []
    for r in rows if isinstance(rows, list) else []:
        try:
            places.append({"name": str(r.get("display_name", ""))[:300], "lat": float(r["lat"]), "lon": float(r["lon"])})
        except (KeyError, TypeError, ValueError):
            continue
    _store(key, places)
    return places
