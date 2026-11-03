"""Patient side of support access: grant, revoke, and see who did what with their data."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_file_key
from app.db.session import get_db
from app.models import AuditLog, User
from app.services import support

router = APIRouter(prefix="/support-access", tags=["support"])


class GrantRequest(BaseModel):
    hours: int = Field(24, ge=1, le=support.MAX_HOURS)
    reason: str | None = Field(None, max_length=300)


class AuditEntry(BaseModel):
    action: str
    actor_role: str
    detail: str | None
    created_at: datetime


class SupportStatus(BaseModel):
    active: bool
    expires_at: datetime | None
    reason: str | None
    log: list[AuditEntry]


def _status(db: Session, user: User) -> SupportStatus:
    g = support.active_grant(db, user.id)
    log = db.scalars(select(AuditLog).where(AuditLog.user_id == user.id).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(50)).all()
    return SupportStatus(
        active=g is not None, expires_at=g.expires_at if g else None, reason=g.reason if g else None,
        log=[AuditEntry(action=a.action, actor_role=a.actor_role, detail=a.detail, created_at=a.created_at) for a in log],
    )


@router.get("", response_model=SupportStatus)
def get_support_access(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _status(db, user)


@router.post("", response_model=SupportStatus, status_code=status.HTTP_201_CREATED)
def grant_support_access(body: GrantRequest, user: User = Depends(get_current_user), key: bytes = Depends(get_file_key),
                         db: Session = Depends(get_db)):
    """Let BookMyCare staff view and correct your data (not your original files) for a limited time."""
    try:
        support.grant(db, user, key, body.hours, body.reason)
    except support.NoStaffAvailable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "No support staff member is set up yet. Please try again later.") from exc
    db.commit()
    return _status(db, user)


@router.delete("", response_model=SupportStatus)
def revoke_support_access(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    support.revoke(db, user)
    db.commit()
    return _status(db, user)
