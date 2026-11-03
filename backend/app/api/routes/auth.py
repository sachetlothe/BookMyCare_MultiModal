from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import get_current_user, get_file_key
from app.core.rate_limit import get_login_limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.db.sealing import open_instance, set_session_key
from app.db.session import get_db
from app.models import PatientProfile, User
from app.schemas.auth import (
    ChangePasswordRequest, LoginRequest, RecoveryCodeResponse, RegisterRequest, ResetPasswordRequest, SecurityStatus,
    TokenResponse, UserOut,
)
from app.services import stats
from app.services.support import ensure_staff_keypair
from app.services.patient_data import seal_user_data
from app.services.patient_keys import (
    KeyUnavailable, create_recovery_code, ensure_user_key, recover_user_key, seal_for_token, set_password_key,
)

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("bookmycare.auth")

_DUMMY_HASH = hash_password("timing-equaliser-not-a-real-password")


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _check_limit(key: str, ip: str) -> None:
    wait = get_login_limiter().retry_after(key, ip)
    if wait:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many failed attempts. Try again in {max(1, round(wait / 60))} minute(s).",
            headers={"Retry-After": str(wait)},
        )


def _token(user: User, key: bytes | None, recovery_code: str | None = None) -> TokenResponse:
    sealed = seal_for_token(key, user.id) if key is not None else None
    return TokenResponse(
        access_token=create_access_token(user.id, sealed, user.session_version or 0),
        user=UserOut.model_validate(user), recovery_code=recovery_code, has_recovery_code=bool(user.recovery_key_wrapped),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(email=email, full_name=body.full_name, hashed_password=hash_password(body.password), session_version=0)
    user.profile = PatientProfile()
    db.add(user)
    db.flush()  # assigns the id the encryption is bound to; nothing is committed yet
    key = ensure_user_key(user, body.password)  # the patient's own key, locked with their password
    set_session_key(db, key)
    user._bmc_legacy = {"full_name"}
    flag_modified(user, "full_name")  # sealed in the commit below
    code = create_recovery_code(user, key)
    stats.bump(db, "signups", "all")
    user.stats_counted = True
    db.commit()
    return _token(user, key, code)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    limiter = get_login_limiter()
    email = body.email.lower()
    ip = _client_ip(request)
    # Checked before the password, so a locked-out client learns nothing even with the right password.
    _check_limit(email, ip)
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    # Always run one bcrypt check so response time does not reveal whether the email exists.
    ok = verify_password(body.password, user.hashed_password if user else _DUMMY_HASH)
    if not user or not ok:
        limiter.record_failure(email, ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account disabled")
    limiter.record_success(email, ip)
    key = None
    try:
        key = ensure_user_key(user, body.password)
        set_session_key(db, key)
        open_instance(user, db)
        moved = seal_user_data(db, user, key)  # older data moves to the patient's key
        if moved:
            log.info("Sealed %d item(s) of user %s with their own key", moved, user.id)
        if ensure_staff_keypair(user):  # staff: key pair for support access, sealed with their own key
            log.info("Created support key pair for staff member %s", user.id)
        stats.backfill_user(db, user)  # older data counted once, in the month it happened
    except KeyUnavailable:
        log.error("File key of user %s could not be opened; data stays locked for this session", user.id)
    db.commit()
    return _token(user, key)


class _PasswordBody(BaseModel):
    password: str


@router.get("/security", response_model=SecurityStatus)
def security_status(user: User = Depends(get_current_user)):
    return SecurityStatus(has_recovery_code=bool(user.recovery_key_wrapped), recovery_created_at=user.recovery_created_at)


@router.post("/recovery-code", response_model=RecoveryCodeResponse)
def new_recovery_code(body: _PasswordBody, request: Request, user: User = Depends(get_current_user),
                      key: bytes = Depends(get_file_key), db: Session = Depends(get_db)):
    """Create (or replace) the recovery code. Needs the current password, so a stolen session alone cannot."""
    ip = _client_ip(request)
    _check_limit(user.email, ip)
    if not verify_password(body.password, user.hashed_password):
        get_login_limiter().record_failure(user.email, ip)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Incorrect password")
    code = create_recovery_code(user, key)
    db.commit()
    return RecoveryCodeResponse(recovery_code=code, recovery_created_at=user.recovery_created_at)


@router.post("/change-password", response_model=TokenResponse)
def change_password(body: ChangePasswordRequest, request: Request, user: User = Depends(get_current_user),
                    key: bytes = Depends(get_file_key), db: Session = Depends(get_db)):
    ip = _client_ip(request)
    _check_limit(user.email, ip)
    if not verify_password(body.current_password, user.hashed_password):
        get_login_limiter().record_failure(user.email, ip)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Current password is incorrect")
    set_password_key(user, key, body.new_password)  # same data key, now locked with the new password
    user.hashed_password = hash_password(body.new_password)
    user.session_version = (user.session_version or 0) + 1  # every other session ends
    db.commit()
    return _token(user, key)


@router.post("/reset-password", response_model=TokenResponse)
def reset_password(body: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Forgotten password: the recovery code unlocks the patient's key, so no data is lost."""
    limiter = get_login_limiter()
    email = body.email.lower()
    ip = _client_ip(request)
    _check_limit("reset:" + email, ip)
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    key = recover_user_key(user, body.recovery_code)
    if user is None or key is None or not user.is_active:
        limiter.record_failure("reset:" + email, ip)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email or recovery code is incorrect")
    limiter.record_success("reset:" + email, ip)
    set_password_key(user, key, body.new_password)
    user.hashed_password = hash_password(body.new_password)
    user.session_version = (user.session_version or 0) + 1
    code = create_recovery_code(user, key)  # the used code is replaced
    set_session_key(db, key)
    open_instance(user, db)
    seal_user_data(db, user, key)
    ensure_staff_keypair(user)
    stats.backfill_user(db, user)
    db.commit()
    return _token(user, key, code)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_everywhere(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """End every session of this patient, on all devices (including this one)."""
    user.session_version = (user.session_version or 0) + 1
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
