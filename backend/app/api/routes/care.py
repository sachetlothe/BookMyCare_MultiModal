"""Care navigation: which type of doctor to consider, and nearby facilities (OpenStreetMap)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Analysis, User
from app.services import facilities, specialty
from app.services.trends import compute_trends

router = APIRouter(prefix="/care", tags=["care"])

# An emergency flagged by an old analysis is not repeated as a standing suggestion.
EMERGENCY_FRESH_FOR = timedelta(hours=24)

ERROR_STATUS = {
    "bad_request": status.HTTP_400_BAD_REQUEST,
    "rate_limited": status.HTTP_429_TOO_MANY_REQUESTS,
    "disabled": status.HTTP_503_SERVICE_UNAVAILABLE,
    "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
}


def _http_error(exc: facilities.FacilitySearchError) -> HTTPException:
    return HTTPException(ERROR_STATUS.get(exc.kind, status.HTTP_503_SERVICE_UNAVAILABLE), str(exc))


@router.get("/specialties")
def list_specialties(user: User = Depends(get_current_user)):
    return [{"code": s["code"], "name": s["name"], "doctor": s["doctor"], "what": s["what"]}
            for s in specialty.specialties().values()]


@router.get("/suggested")
def suggested(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Doctor types suggested by the latest analysis and by the patient's current lab trends."""
    latest = db.scalars(
        select(Analysis).where(Analysis.user_id == user.id, Analysis.status == "completed")
        .order_by(Analysis.created_at.desc(), Analysis.id.desc()).limit(1)
    ).first()
    conditions: list[dict] = []
    urgency = "routine"
    based_on = None
    if latest is not None:
        result = latest.result or {}
        conditions = result.get("conditions", [])
        created = latest.created_at if latest.created_at.tzinfo else latest.created_at.replace(tzinfo=timezone.utc)
        if result.get("urgency") != "emergency" or datetime.now(timezone.utc) - created < EMERGENCY_FRESH_FOR:
            urgency = result.get("urgency", "routine")
        based_on = {"analysis_id": latest.id, "created_at": created.isoformat()}

    sex = user.profile.sex if user.profile else None
    trends = compute_trends(db, user.id, sex)
    rec = specialty.recommend(conditions, urgency, trends)
    rec["based_on_analysis"] = based_on
    rec["trends_considered"] = sum(t["n"] >= 2 for t in trends)
    return rec


@router.get("/facilities")
def nearby_facilities(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(5, gt=0, le=50),
    specialty_code: str | None = Query(None, alias="specialty", max_length=40),
    user: User = Depends(get_current_user),
):
    try:
        return facilities.search(lat, lon, radius_km, specialty_code or None, user.id)
    except facilities.FacilitySearchError as exc:
        raise _http_error(exc) from exc


@router.get("/geocode")
def geocode(q: str = Query(..., min_length=2, max_length=120), user: User = Depends(get_current_user)):
    try:
        return {"results": facilities.geocode(q, user.id), "attribution": facilities.ATTRIBUTION}
    except facilities.FacilitySearchError as exc:
        raise _http_error(exc) from exc
