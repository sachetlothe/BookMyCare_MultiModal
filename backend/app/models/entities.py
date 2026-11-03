"""SQLAlchemy ORM models."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    # encrypted with the user's own key (app/db/sealing.py); staff_private_key only exists for staff
    __sealed__ = ("full_name", "staff_private_key")

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(Text)
    hashed_password: Mapped[str] = mapped_column(String(255))
    # The patient's own file key, encrypted with a key derived from their password (scrypt).
    # Neither the database nor the server can open it without the password.
    file_key_salt: Mapped[str | None] = mapped_column(String(64), nullable=True)
    file_key_wrapped: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # The same file key wrapped with the patient's recovery code (for a forgotten password).
    recovery_key_salt: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recovery_key_wrapped: Mapped[str | None] = mapped_column(String(200), nullable=True)
    recovery_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Raised on password change/reset and "sign out everywhere": older tokens stop working.
    session_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    role: Mapped[str] = mapped_column(String(20), default="patient", server_default="patient")  # patient | staff
    # Staff only: X25519 key pair for support access. The private key is sealed with the staff member's
    # own key, so only their signed-in requests can use it - not the server, not the database.
    staff_public_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    staff_private_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    stats_counted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    profile: Mapped[PatientProfile | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    history: Mapped[list[MedicalHistoryEntry]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    reports: Mapped[list[MedicalReport]] = relationship(back_populates="user", cascade="all, delete-orphan")
    analyses: Mapped[list[Analysis]] = relationship(back_populates="user", cascade="all, delete-orphan")


class PatientProfile(Base):
    __tablename__ = "patient_profiles"
    __sealed__ = ("allergies", "chronic_conditions", "current_medications", "emergency_contact")

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    sex: Mapped[str | None] = mapped_column(String(20), nullable=True)  # female / male / other
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    blood_group: Mapped[str | None] = mapped_column(String(5), nullable=True)
    is_pregnant: Mapped[bool] = mapped_column(Boolean, default=False)
    smoker: Mapped[bool] = mapped_column(Boolean, default=False)
    alcohol_use: Mapped[str | None] = mapped_column(String(20), nullable=True)  # none/occasional/regular
    activity_level: Mapped[str | None] = mapped_column(String(20), nullable=True)  # low/moderate/high
    allergies: Mapped[list[str]] = mapped_column(JSON, default=list)
    chronic_conditions: Mapped[list[str]] = mapped_column(JSON, default=list)
    current_medications: Mapped[list[str]] = mapped_column(JSON, default=list)
    emergency_contact: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="profile")


class MedicalHistoryEntry(Base):
    __tablename__ = "medical_history"
    __sealed__ = ("title", "details")

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(30))  # condition/surgery/medication/allergy/vaccination/visit/other
    title: Mapped[str] = mapped_column(Text)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_ongoing: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="history")


class MedicalReport(Base):
    """An uploaded file: either a document report (lab/PDF/scan) or a medical image."""

    __tablename__ = "medical_reports"
    # extracted_text is sealed separately (services/patient_keys.encrypt_text)
    __sealed__ = ("title", "original_filename", "lab_values", "image_features")

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="report")  # report / image
    title: Mapped[str] = mapped_column(Text)
    report_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # e.g. blood_test, xray, skin_photo
    original_filename: Mapped[str] = mapped_column(Text)
    stored_filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    report_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    extraction_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/done/partial/failed/skipped
    extraction_method: Mapped[str | None] = mapped_column(String(30), nullable=True)  # pdf_text/ocr/plain_text/image_meta
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extraction_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    lab_values: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    image_features: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    stats_counted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")  # in anonymous statistics

    user: Mapped[User] = relationship(back_populates="reports")
    lab_results: Mapped[list[LabResult]] = relationship(back_populates="report", cascade="all, delete-orphan", passive_deletes=True)


class LabTestCatalog(Base):
    """One row per recognised test: standard name, unit, LOINC code and trend threshold."""

    __tablename__ = "lab_test_catalog"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)  # e.g. hba1c (same as lab_parser keys)
    name: Mapped[str] = mapped_column(String(120))
    unit: Mapped[str] = mapped_column(String(30))  # every lab_results value is stored in this unit
    loinc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    category: Mapped[str] = mapped_column(String(40))
    ref_low: Mapped[float | None] = mapped_column(Float, nullable=True)  # generic adult range
    ref_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Smallest change between two results treated as a real change rather than test noise (hand-set).
    min_change: Mapped[float | None] = mapped_column(Float, nullable=True)


class LabResult(Base):
    """One lab value from one report, in the catalog unit. Trends are computed from these rows,
    so the original (encrypted) report never has to be opened again."""

    __tablename__ = "lab_results"
    __sealed__ = ("data",)
    __table_args__ = (
        UniqueConstraint("report_id", "test_code", name="uq_lab_results_report_test"),
        Index("ix_lab_results_user_test_date", "user_id", "test_code", "test_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    report_id: Mapped[int] = mapped_column(ForeignKey("medical_reports.id", ondelete="CASCADE"), index=True)
    test_code: Mapped[str] = mapped_column(ForeignKey("lab_test_catalog.code"))
    # {"value", "unit", "ref_low", "ref_high", "status"} - sealed with the patient's key
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    test_date: Mapped[date] = mapped_column(Date)  # report date, or upload date if unknown
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    report: Mapped[MedicalReport] = relationship(back_populates="lab_results")


class Analysis(Base):
    __tablename__ = "analyses"
    __sealed__ = ("inputs", "result")

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="completed")  # completed / failed
    inputs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    urgency: Mapped[str] = mapped_column(String(20), default="routine")  # emergency/urgent/soon/routine
    provider: Mapped[str] = mapped_column(String(30), default="mock")
    is_mock: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    stats_counted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")  # in anonymous statistics

    user: Mapped[User] = relationship(back_populates="analyses")


class HealthDocument(Base):
    """Public-health reference text (WHO/CDC) used for retrieval."""

    __tablename__ = "health_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(300))
    source: Mapped[str] = mapped_column(String(20))  # WHO / CDC
    url: Mapped[str] = mapped_column(String(500))
    topics: Mapped[list[str]] = mapped_column(JSON, default=list)
    content: Mapped[str] = mapped_column(Text)
    origin: Mapped[str] = mapped_column(String(20), default="curated")  # curated / ingested
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SupportGrant(Base):
    """A patient's time-limited consent for BookMyCare staff to view and correct their data.

    The patient's key is stored once per staff member (``support_grant_keys``), encrypted to that
    staff member's public key and bound to patient, staff member and expiry. Only that staff
    member's signed-in request can open it. Revoking or expiry deletes every copy.
    """

    __tablename__ = "support_grants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SupportGrantKey(Base):
    __tablename__ = "support_grant_keys"
    __table_args__ = (UniqueConstraint("grant_id", "staff_id", name="uq_support_grant_keys"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    grant_id: Mapped[int] = mapped_column(ForeignKey("support_grants.id", ondelete="CASCADE"), index=True)
    staff_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    sealed_key: Mapped[str] = mapped_column(Text)  # ephemeral public key | nonce | ciphertext (base64)


class AuditLog(Base):
    """Who did what with a patient's data. ``detail`` is sealed with the patient's key."""

    __tablename__ = "audit_logs"
    __sealed__ = ("detail",)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)  # the patient
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_role: Mapped[str] = mapped_column(String(20))  # patient | staff
    action: Mapped[str] = mapped_column(String(60))  # generic, no health data
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StatCounter(Base):
    """Anonymous event counts for team reports. No user id, no free text."""

    __tablename__ = "stat_counters"
    __table_args__ = (UniqueConstraint("metric", "period", "dimension", name="uq_stat_counters"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    metric: Mapped[str] = mapped_column(String(40))
    period: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    dimension: Mapped[str] = mapped_column(String(80))
    count: Mapped[int] = mapped_column(Integer, default=0)
