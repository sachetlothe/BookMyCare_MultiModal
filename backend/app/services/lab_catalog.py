"""Reference metadata for every test the lab parser recognises.

* ``loinc`` - standard LOINC code so results can be exchanged with other systems
  (check https://loinc.org before relying on a code in production).
* ``min_change`` - smallest difference between two results that is treated as a real
  change rather than normal day-to-day / laboratory variation. These are hand-set,
  approximate values for an educational prototype and are **not clinically validated**.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.services.lab_parser import SPEC_BY_KEY

# code: (LOINC, category, min_change)
CATALOG: dict[str, tuple[str | None, str, float]] = {
    "hba1c": ("4548-4", "Diabetes", 0.4),
    "glucose_fasting": ("1558-6", "Diabetes", 10),
    "glucose_random": ("2345-7", "Diabetes", 20),
    "hemoglobin": ("718-7", "Blood count", 1.0),
    "wbc": ("6690-2", "Blood count", 2.0),
    "platelets": ("777-3", "Blood count", 50),
    "total_cholesterol": ("2093-3", "Lipids", 20),
    "ldl": ("13457-7", "Lipids", 15),
    "hdl": ("2085-9", "Lipids", 5),
    "triglycerides": ("2571-8", "Lipids", 30),
    "creatinine": ("2160-0", "Kidney", 0.2),
    "urea": ("3094-0", "Kidney", 8),
    "tsh": ("3016-3", "Thyroid", 1.0),
    "alt": ("1742-6", "Liver", 15),
    "ast": ("1920-8", "Liver", 12),
    "bilirubin_total": ("1975-2", "Liver", 0.3),
    "vitamin_d": ("62292-8", "Vitamins and iron", 8),
    "vitamin_b12": ("2132-9", "Vitamins and iron", 100),
    "ferritin": ("2276-4", "Vitamins and iron", 30),
    "sodium": ("2951-2", "Electrolytes", 4),
    "potassium": ("2823-3", "Electrolytes", 0.5),
    "crp": ("1988-5", "Inflammation", 5),
    "esr": ("30341-2", "Inflammation", 10),
    "uric_acid": ("3084-1", "Other", 1.0),
    "spo2": ("59408-5", "Vital signs", 3),
    "heart_rate": ("8867-4", "Vital signs", 15),
    "bp_systolic": ("8480-6", "Vital signs", 10),
    "bp_diastolic": ("8462-4", "Vital signs", 8),
}


def catalog_rows() -> list[dict]:
    rows = []
    for code, spec in SPEC_BY_KEY.items():
        loinc, category, min_change = CATALOG.get(code, (None, "Other", None))
        rows.append({
            "code": code, "name": spec.name, "unit": spec.unit, "loinc": loinc, "category": category,
            "ref_low": spec.low, "ref_high": spec.high, "min_change": min_change,
        })
    return rows


def min_change(code: str, latest: float) -> float:
    entry = CATALOG.get(code)
    return entry[2] if entry else max(abs(latest) * 0.15, 1e-6)


def ensure_catalog(db: Session) -> int:
    """Insert or update catalog rows so they match the parser. Returns rows added."""
    from app.models import LabTestCatalog

    existing = {c.code: c for c in db.scalars(select(LabTestCatalog)).all()}
    added = 0
    for row in catalog_rows():
        cur = existing.get(row["code"])
        if cur is None:
            db.add(LabTestCatalog(**row))
            added += 1
        else:
            for k, v in row.items():
                if getattr(cur, k) != v:
                    setattr(cur, k, v)
    db.flush()
    return added
