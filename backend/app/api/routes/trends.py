from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.services.lab_parser import SPEC_BY_KEY
from app.services.trends import compute_trends

router = APIRouter(prefix="/trends", tags=["trends"])

NOTE = ("Trends are computed from the lab values stored for each of your reports. Thresholds are hand-set "
        "for this prototype and are not clinically validated; results from different laboratories may not be directly comparable.")


@router.get("")
def list_trends(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sex = user.profile.sex if user.profile else None
    tests = compute_trends(db, user.id, sex)
    return {
        "tests": tests,
        "with_history": sum(t["n"] >= 2 for t in tests),
        "needs_attention": sum(t["assessment"] in ("worsening", "approaching_limit") for t in tests),
        "note": NOTE,
    }


@router.get("/{code}")
def get_trend(code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if code not in SPEC_BY_KEY:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown test")
    sex = user.profile.sex if user.profile else None
    t = next((t for t in compute_trends(db, user.id, sex) if t["code"] == code), None)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No results for this test yet")
    return t
