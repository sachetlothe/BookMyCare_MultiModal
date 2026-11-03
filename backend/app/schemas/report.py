from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LabValue(BaseModel):
    test: str
    key: str
    value: float
    unit: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None
    status: str  # low / normal / high / critical_low / critical_high
    raw: str | None = None


class ReportUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    report_type: str | None = Field(None, max_length=50)
    report_date: date | None = None


class ReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    title: str
    report_type: str | None
    original_filename: str
    content_type: str
    size_bytes: int
    report_date: date | None
    extraction_status: str
    extraction_method: str | None
    lab_count: int = 0
    created_at: datetime


class ReportDetail(ReportSummary):
    extracted_text: str | None
    extraction_error: str | None
    lab_values: list[dict[str, Any]]
    image_features: dict[str, Any] | None
    # False while originals are sealed (ALLOW_FILE_DOWNLOAD=false); the UI then hides preview and download.
    file_download_allowed: bool = False
