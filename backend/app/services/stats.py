"""Anonymous statistics for team reports.

Counters are increased inside the patient's own request, when the plain values are known.
They hold only (metric, month, category) -> count: no user id, no dates finer than a month,
no free text. Reports suppress small groups (< STATS_MIN_COUNT) so no one can be singled out.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import StatCounter

log = logging.getLogger("bookmycare.stats")

METRICS = {
    "signups": "New accounts",
    "reports_uploaded": "Files uploaded (by kind)",
    "lab_results": "Lab results recorded (by test)",
    "lab_abnormal": "Out-of-range lab results (by test and direction)",
    "analyses": "Analyses run (by urgency)",
    "analysis_top_condition": "Top screening match (by condition)",
    "trend_worsening": "Worsening trends seen in analyses (by test)",
}


def period(dt: datetime | None = None) -> str:
    return (dt or datetime.now(timezone.utc)).strftime("%Y-%m")


def bump(db: Session, metric: str, dimension: str, n: int = 1, when: datetime | None = None) -> None:
    """Add n to a counter for the month of ``when`` (default: now). Never raises into the caller's request."""
    if metric not in METRICS or not dimension:
        return
    p, dim = period(when), str(dimension)[:80]
    try:
        with db.begin_nested():
            res = db.execute(update(StatCounter).where(StatCounter.metric == metric, StatCounter.period == p,
                                                       StatCounter.dimension == dim).values(count=StatCounter.count + n))
            if res.rowcount == 0:
                db.add(StatCounter(metric=metric, period=p, dimension=dim, count=n))
                db.flush()
    except IntegrityError:  # created concurrently: add to it instead
        with db.begin_nested():
            db.execute(update(StatCounter).where(StatCounter.metric == metric, StatCounter.period == p,
                                                 StatCounter.dimension == dim).values(count=StatCounter.count + n))
    except Exception:  # statistics must never break patient features
        log.exception("Could not update statistic %s", metric)


def report(db: Session, min_count: int) -> list[dict]:
    rows = db.scalars(select(StatCounter).order_by(StatCounter.metric, StatCounter.period.desc(), StatCounter.count.desc())).all()
    out: dict[str, dict] = {}
    for r in rows:
        m = out.setdefault(r.metric, {"metric": r.metric, "label": METRICS.get(r.metric, r.metric), "rows": []})
        small = r.count < min_count
        m["rows"].append({"period": r.period, "dimension": r.dimension, "count": None if small else r.count,
                          "display": f"<{min_count}" if small else str(r.count)})
    return list(out.values())


# --------------------------------------------------------------------------- counting

def count_report(db: Session, r, when: datetime | None = None) -> None:
    """Count one uploaded file and its lab values once (``stats_counted`` prevents double counting)."""
    if r.stats_counted:
        return
    bump(db, "reports_uploaded", r.kind, when=when)
    for v in r.lab_values or []:
        if not isinstance(v, dict):
            continue
        bump(db, "lab_results", v.get("key", ""), when=when)
        if v.get("status", "normal") != "normal":
            bump(db, "lab_abnormal", f"{v.get('key')}:{'high' if str(v['status']).endswith('high') else 'low'}", when=when)
    r.stats_counted = True


def count_analysis(db: Session, a, when: datetime | None = None) -> None:
    if a.stats_counted or not isinstance(a.result, dict):
        return
    result = a.result
    bump(db, "analyses", result.get("urgency") or a.urgency, when=when)
    if result.get("conditions"):
        bump(db, "analysis_top_condition", result["conditions"][0]["key"], when=when)
    for t in result.get("trends") or []:
        if t.get("assessment") == "worsening":
            bump(db, "trend_worsening", t["code"], when=when)
    a.stats_counted = True


def backfill_user(db: Session, user) -> int:
    """Count a patient's older data (from before statistics existed) in the month it happened.
    Runs at sign-in, when the patient's key is available to read it. Returns items counted."""
    from app.models import Analysis, MedicalReport

    n = 0
    if not user.stats_counted:
        bump(db, "signups", "all", when=user.created_at)
        user.stats_counted = True
        n += 1
    for r in db.scalars(select(MedicalReport).where(MedicalReport.user_id == user.id, MedicalReport.stats_counted.is_(False))).all():
        count_report(db, r, when=r.created_at)
        n += 1
    for a in db.scalars(select(Analysis).where(Analysis.user_id == user.id, Analysis.stats_counted.is_(False))).all():
        count_analysis(db, a, when=a.created_at)
        n += 1
    return n


def pending(db: Session) -> dict:
    """How much older data is not in the statistics yet (counted at each owner's next sign-in)."""
    from sqlalchemy import func

    from app.models import Analysis, MedicalReport, User

    return {
        "accounts": db.scalar(select(func.count()).select_from(User).where(User.stats_counted.is_(False), User.role != "staff")) or 0,
        "files": db.scalar(select(func.count()).select_from(MedicalReport).where(MedicalReport.stats_counted.is_(False))) or 0,
        "analyses": db.scalar(select(func.count()).select_from(Analysis).where(Analysis.stats_counted.is_(False))) or 0,
    }
