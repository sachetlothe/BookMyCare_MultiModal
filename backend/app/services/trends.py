"""Longitudinal (over-time) analysis of a patient's lab results.

Works only on the structured ``lab_results`` rows, never on the original files. For each
test it reports the direction of change, whether the change is larger than normal test
variation (``min_change`` in the catalog), status changes (normal -> high, high -> normal),
results that stay abnormal over time, rapid changes and values approaching a limit.

Rules and thresholds are transparent and hand-set for an educational prototype; they are
not clinically validated. Medicines recorded during a trend are listed as context only:
the order of events does not show that a medicine caused a change.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import LabResult, LabTestCatalog, MedicalHistoryEntry
from app.services.lab_catalog import min_change
from app.services.lab_parser import SPEC_BY_KEY, classify, range_for

ASSESSMENT_ORDER = {"worsening": 0, "approaching_limit": 1, "improving": 2, "stable": 3, "single_result": 4}
RAPID_CHANGE = 0.20  # >= 20 % between two consecutive results
PROJECTION_DAYS = 365
PERSISTENT_MIN_DAYS = 30


def _fmt(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".") if abs(v) < 10 else f"{v:.1f}".rstrip("0").rstrip(".")


def _span_text(days: int) -> str:
    if days >= 60:
        months = round(days / 30.44)
        return f"{months} months" if months != 12 else "1 year"
    return f"{days} day{'s' if days != 1 else ''}"


def _distance(v: float, low: float | None, high: float | None) -> float:
    """How far a value lies outside the reference range (0 when inside)."""
    if low is not None and v < low:
        return low - v
    if high is not None and v > high:
        return v - high
    return 0.0


def _slope_per_day(points: list[dict]) -> float:
    d0 = points[0]["date"]
    xs = [(p["date"] - d0).days for p in points]
    ys = [p["value"] for p in points]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    return 0.0 if sxx == 0 else sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx


def _side(status: str) -> str | None:
    return "high" if status.endswith("high") else "low" if status.endswith("low") else None


def analyse_series(code: str, points: list[dict], sex: str | None, catalog: dict | None = None) -> dict:
    """``points``: [{date, value, report_id}] for one test, any order."""
    spec = SPEC_BY_KEY[code]
    low, high = range_for(spec, sex)
    pts = sorted(points, key=lambda p: (p["date"], p.get("report_id") or 0))
    # one value per day: a later report on the same day replaces an earlier one
    by_day: dict[date, dict] = {}
    for p in pts:
        by_day[p["date"]] = p
    pts = [dict(p, status=classify(spec, p["value"], sex)) for p in by_day.values()]
    cat = catalog or {}
    latest = pts[-1]
    out = {
        "code": code, "name": spec.name, "unit": spec.unit, "category": cat.get("category"), "loinc": cat.get("loinc"),
        "ref_low": low, "ref_high": high, "n": len(pts),
        "points": [{"date": p["date"].isoformat(), "value": p["value"], "status": p["status"], "report_id": p.get("report_id")} for p in pts],
        "latest": {"date": latest["date"].isoformat(), "value": latest["value"], "status": latest["status"]},
        "direction": None, "assessment": "single_result", "toward": _side(latest["status"]),
        "change": None, "change_pct": None, "slope_per_year": None, "span_days": 0,
        "flags": [], "events": [], "min_change": None,
        "summary": f"Only one {spec.name} result so far ({latest['date'].isoformat()}).",
    }
    if len(pts) < 2:
        return out

    first, prev = pts[0], pts[-2]
    thr = min_change(code, latest["value"])
    total = latest["value"] - first["value"]
    step = latest["value"] - prev["value"]
    span = (latest["date"] - first["date"]).days
    slope = _slope_per_day(pts)
    if abs(total) >= thr:
        direction = "rising" if total > 0 else "falling"
    elif abs(step) >= thr:
        direction = "rising" if step > 0 else "falling"
    else:
        direction = "stable"

    flags: list[dict] = []
    # consecutive moves in the same direction at the end of the series
    streak = 0
    for a, b in zip(reversed(pts[:-1]), reversed(pts)):
        d = b["value"] - a["value"]
        if d == 0 or (direction == "rising" and d < 0) or (direction == "falling" and d > 0) or direction == "stable":
            break
        streak += 1
    if streak >= 2:
        flags.append({"kind": "consistent", "text": f"{'Rose' if direction == 'rising' else 'Fell'} in each of the last {streak} results"})

    if prev["value"] and abs(step) >= thr and abs(step) / abs(prev["value"]) >= RAPID_CHANGE:
        flags.append({"kind": "rapid_change", "text": f"Changed by {round(100 * step / prev['value'])}% since the previous result ({prev['date'].isoformat()})"})

    prev_side, latest_side = _side(prev["status"]), _side(latest["status"])
    if prev_side is None and latest_side:
        flags.append({"kind": "new_abnormal", "text": f"Was in the normal range on {prev['date'].isoformat()}, now {latest['status'].replace('_', ' ')}"})
    elif prev_side and latest_side is None:
        flags.append({"kind": "back_to_normal", "text": f"Back in the normal range (was {prev['status'].replace('_', ' ')} on {prev['date'].isoformat()})"})

    run = []
    for p in reversed(pts):
        if latest_side and _side(p["status"]) == latest_side:
            run.append(p)
        else:
            break
    if len(run) >= 2 and (run[0]["date"] - run[-1]["date"]).days >= PERSISTENT_MIN_DAYS:
        flags.append({"kind": "persistent", "text": f"{latest_side.capitalize()} on {len(run)} results over {_span_text((run[0]['date'] - run[-1]['date']).days)}", "count": len(run)})

    d_first, d_prev, d_latest = (_distance(p["value"], low, high) for p in (first, prev, latest))
    kinds = {f["kind"] for f in flags}
    toward = latest_side or ("high" if direction == "rising" else "low" if direction == "falling" else None)
    if "new_abnormal" in kinds or (d_latest - min(d_first, d_prev) >= thr and d_latest > 0):
        assessment = "worsening"
    elif "back_to_normal" in kinds or (max(d_first, d_prev) - d_latest >= thr and d_latest <= d_prev):
        assessment = "improving"
        toward = prev_side or _side(first["status"]) or toward
    else:
        assessment = "stable"
        if d_latest == 0 and direction != "stable" and slope:
            limit = high if slope > 0 else low
            if limit is not None and (limit - latest["value"]) / slope <= PROJECTION_DAYS:
                assessment = "approaching_limit"
                flags.append({"kind": "approaching_limit", "text": f"At the current rate it would pass the {'upper' if slope > 0 else 'lower'} limit ({_fmt(limit)} {spec.unit}) within about a year"})

    verb = {"rising": "rose", "falling": "fell", "stable": "showed no clear change"}[direction]
    unit = "" if spec.unit == "%" else f" {spec.unit}"
    pct = "%" if spec.unit == "%" else ""
    summary = (
        f"{spec.name} {verb} from {_fmt(first['value'])}{pct} to {_fmt(latest['value'])}{pct}{unit} over {_span_text(span)} "
        f"({len(pts)} results)" if direction != "stable"
        else f"{spec.name} {verb} ({_fmt(first['value'])}{pct} → {_fmt(latest['value'])}{pct}{unit}) over {_span_text(span)} ({len(pts)} results)"
    )
    summary += f"; latest is {latest['status'].replace('_', ' ')}." if latest["status"] != "normal" else "; latest is in the normal range."

    out.update({
        "direction": direction, "assessment": assessment, "toward": toward, "flags": flags,
        "change": round(total, 3), "change_pct": round(100 * total / first["value"], 1) if first["value"] else None,
        "slope_per_year": round(slope * 365, 3), "span_days": span, "min_change": thr, "summary": summary,
    })
    return out


def _history_events(db: Session, user_id: int) -> list[dict]:
    rows = db.scalars(select(MedicalHistoryEntry).where(
        MedicalHistoryEntry.user_id == user_id, MedicalHistoryEntry.event_date.is_not(None),
        MedicalHistoryEntry.category.in_(("medication", "condition", "surgery")),
    )).all()
    return [{"date": e.event_date, "category": e.category, "title": e.title} for e in rows]


def compute_trends(db: Session, user_id: int, sex: str | None) -> list[dict]:
    # Load entities (not bare columns) so the sealed values are decrypted with the patient's key.
    rows = db.scalars(select(LabResult).where(LabResult.user_id == user_id)).all()
    if not rows:
        return []
    catalog = {c.code: {"category": c.category, "loinc": c.loinc} for c in db.scalars(select(LabTestCatalog)).all()}
    series: dict[str, list[dict]] = {}
    for row in rows:
        v = (row.data or {}).get("value") if isinstance(row.data, dict) else None
        if row.test_code in SPEC_BY_KEY and isinstance(v, (int, float)):  # sealed rows without the key are skipped
            series.setdefault(row.test_code, []).append({"date": row.test_date, "value": float(v), "report_id": row.report_id})
    events = _history_events(db, user_id)
    out = []
    for code, pts in series.items():
        t = analyse_series(code, pts, sex, catalog.get(code))
        if t["n"] >= 2:
            start, end = date.fromisoformat(t["points"][0]["date"]), date.fromisoformat(t["latest"]["date"])
            t["events"] = [{"date": e["date"].isoformat(), "category": e["category"], "title": e["title"]}
                           for e in events if start <= e["date"] <= end]
        out.append(t)
    out.sort(key=lambda t: (ASSESSMENT_ORDER[t["assessment"]], -t["n"], t["name"]))
    return out


def trend_signals(trends: list[dict]) -> list[dict]:
    """Compact signals the scorer can use: one per test with at least two results."""
    sig = []
    for t in trends:
        if t["n"] < 2:
            continue
        kinds = {f["kind"] for f in t["flags"]}
        persistent = next((f for f in t["flags"] if f["kind"] == "persistent"), None)
        sig.append({
            "key": t["code"], "name": t["name"], "assessment": t["assessment"], "toward": t["toward"], "summary": t["summary"],
            "persistent_count": persistent["count"] if persistent else 0,
            "persistent_text": f"{t['name']} {persistent['text'][0].lower()}{persistent['text'][1:]}" if persistent else "",
            "rapid": "rapid_change" in kinds,
        })
    return sig
