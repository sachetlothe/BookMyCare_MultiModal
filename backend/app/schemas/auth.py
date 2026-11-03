from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def _strong(v: str) -> str:
    if not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
        raise ValueError("Password must contain at least one letter and one number")
    return v


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        return _strong(v)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name is too short")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    full_name: str
    created_at: datetime
    role: str = "patient"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    # Shown ONCE (after sign-up, a reset or on request). It is the only way back in after a forgotten password.
    recovery_code: str | None = None
    has_recovery_code: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        return _strong(v)


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    recovery_code: str = Field(min_length=10, max_length=60)
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        return _strong(v)


class SecurityStatus(BaseModel):
    has_recovery_code: bool
    recovery_created_at: datetime | None


class RecoveryCodeResponse(BaseModel):
    recovery_code: str
    recovery_created_at: datetime
