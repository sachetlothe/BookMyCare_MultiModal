from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token_payload
from app.db.sealing import KEY, open_instance, set_session_key
from app.db.session import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)

SIGN_IN_AGAIN = "For your security, please sign in again to unlock your data."


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    """The signed-in patient. Also unlocks their own key for this request's database session,
    so their sealed data is readable here and nowhere else."""
    from app.services.patient_keys import open_from_token

    if creds is None or creds.scheme.lower() != "bearer":
        raise _unauthorized()
    payload = decode_token_payload(creds.credentials)
    sub = (payload or {}).get("sub")
    if not sub or not str(sub).isdigit():
        raise _unauthorized()
    user = db.get(User, int(sub))
    if not user or not user.is_active:
        raise _unauthorized()
    if int(payload.get("sv", 0)) != (user.session_version or 0):
        raise _unauthorized("Your session has ended (password changed or signed out everywhere). Please sign in again.")
    key = open_from_token(payload.get("fk"), user.id)
    if key is None:  # token issued before patient keys, or forged on the server without the password
        raise _unauthorized(SIGN_IN_AGAIN)
    set_session_key(db, key)
    open_instance(user, db)  # loaded before the key was set
    return user


def get_file_key(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> bytes:
    return db.info[KEY]


require_file_key = get_file_key
