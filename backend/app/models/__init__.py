from app.models.entities import (  # noqa: F401
    Analysis,
    AuditLog,
    HealthDocument,
    LabResult,
    LabTestCatalog,
    MedicalHistoryEntry,
    MedicalReport,
    PatientProfile,
    StatCounter,
    SupportGrant,
    SupportGrantKey,
    User,
)
from app.db import sealing  # noqa: F401,E402  (registers the sealed-field events)
