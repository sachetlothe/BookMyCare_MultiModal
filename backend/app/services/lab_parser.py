"""Parse common laboratory values out of free report text.

Reference ranges are generic adult ranges used for *screening explanations only*.
Labs use different methods and ranges; the range printed on the patient's own
report always takes precedence, and results must be reviewed by a clinician.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class LabSpec:
    key: str
    name: str
    aliases: tuple[str, ...]
    unit: str
    low: float | None
    high: float | None
    crit_low: float | None = None
    crit_high: float | None = None
    # Optional sex-specific overrides: {"female": (low, high), "male": (low, high)}
    sex_ranges: dict[str, tuple[float | None, float | None]] = field(default_factory=dict)
    plausible: tuple[float, float] = (0, 100000)
    explain_low: str = ""
    explain_high: str = ""


LAB_SPECS: tuple[LabSpec, ...] = (
    LabSpec("hba1c", "HbA1c", ("hba1c", "hb a1c", "glycated hemoglobin", "glycated haemoglobin", "glycosylated hemoglobin", "hemoglobin a1c", "haemoglobin a1c", "a1c"),
            "%", None, 5.6, crit_high=14, plausible=(3, 20),
            explain_high="Reflects average blood sugar over ~3 months; 5.7–6.4% is often described as the prediabetes range and ≥6.5% as the diabetes range."),
    LabSpec("glucose_fasting", "Fasting glucose", ("fasting blood sugar", "fasting glucose", "fasting plasma glucose", "fbs", "fpg", "glucose fasting", "glucose, fasting", "blood sugar fasting", "blood sugar (fasting)", "glucose (fasting)"),
            "mg/dL", 70, 99, crit_low=54, crit_high=400, plausible=(10, 1500),
            explain_low="Low blood sugar can cause shakiness, sweating or confusion.",
            explain_high="Fasting glucose of 100–125 mg/dL is often described as impaired fasting glucose; ≥126 mg/dL on repeat testing is in the diabetes range."),
    LabSpec("glucose_random", "Random / post-meal glucose", ("random blood sugar", "rbs", "random glucose", "post prandial", "postprandial", "ppbs", "glucose random", "glucose (random)"),
            "mg/dL", 70, 139, crit_low=54, crit_high=400, plausible=(10, 1500),
            explain_high="Raised non-fasting glucose can indicate impaired sugar control and is usually followed up with fasting glucose or HbA1c."),
    LabSpec("hemoglobin", "Hemoglobin", ("hemoglobin", "haemoglobin", "hgb", "hb"),
            "g/dL", 12.0, 17.5, crit_low=7.0, crit_high=20.0,
            sex_ranges={"female": (12.0, 15.5), "male": (13.5, 17.5)}, plausible=(2, 25),
            explain_low="Low hemoglobin (anaemia) can cause tiredness, breathlessness and pale skin; iron deficiency is a common cause.",
            explain_high="High hemoglobin can be seen with dehydration, smoking or living at altitude."),
    LabSpec("wbc", "White blood cells", ("wbc", "white blood cell", "white blood cells", "total leucocyte count", "total leukocyte count", "tlc", "leukocytes", "leucocytes"),
            "x10^3/µL", 4.0, 11.0, crit_low=2.0, crit_high=30.0, plausible=(0.1, 200),
            explain_low="A low white cell count can reduce the ability to fight infection.",
            explain_high="A raised white cell count often accompanies infection or inflammation."),
    LabSpec("platelets", "Platelets", ("platelet count", "platelets", "plt"),
            "x10^3/µL", 150, 450, crit_low=50, crit_high=1000, plausible=(1, 3000),
            explain_low="Low platelets can increase bleeding risk; this is seen in some viral infections such as dengue.",
            explain_high="High platelets can be reactive to inflammation or iron deficiency."),
    LabSpec("total_cholesterol", "Total cholesterol", ("total cholesterol", "cholesterol total", "cholesterol, total", "serum cholesterol", "cholesterol"),
            "mg/dL", None, 199, plausible=(40, 1000),
            explain_high="Raised cholesterol is a risk factor for heart disease and stroke."),
    LabSpec("ldl", "LDL cholesterol", ("ldl cholesterol", "ldl-c", "ldl", "low density lipoprotein"),
            "mg/dL", None, 129, crit_high=300, plausible=(5, 600),
            explain_high="LDL is the main cholesterol fraction linked to blocked arteries."),
    LabSpec("hdl", "HDL cholesterol", ("hdl cholesterol", "hdl-c", "hdl", "high density lipoprotein"),
            "mg/dL", 40, None, sex_ranges={"female": (50, None), "male": (40, None)}, plausible=(5, 200),
            explain_low="Low HDL ('good' cholesterol) is associated with higher cardiovascular risk."),
    LabSpec("triglycerides", "Triglycerides", ("triglycerides", "triglyceride", "tg"),
            "mg/dL", None, 149, crit_high=1000, plausible=(10, 5000),
            explain_high="High triglycerides are linked to diet, alcohol, diabetes and heart risk."),
    LabSpec("creatinine", "Creatinine", ("serum creatinine", "creatinine"),
            "mg/dL", 0.6, 1.3, crit_high=4.0, sex_ranges={"female": (0.5, 1.1), "male": (0.7, 1.3)}, plausible=(0.1, 25),
            explain_high="Raised creatinine can indicate reduced kidney filtering function."),
    LabSpec("urea", "Urea / BUN", ("blood urea nitrogen", "bun", "blood urea", "urea"),
            "mg/dL", 7, 40, plausible=(1, 400),
            explain_high="Raised urea can be due to dehydration or reduced kidney function."),
    LabSpec("tsh", "TSH", ("tsh", "thyroid stimulating hormone"),
            "mIU/L", 0.4, 4.0, crit_high=50, plausible=(0.001, 500),
            explain_low="Low TSH can be seen when the thyroid is overactive.",
            explain_high="High TSH often suggests an underactive thyroid (hypothyroidism)."),
    LabSpec("alt", "ALT (SGPT)", ("alt", "sgpt", "alanine aminotransferase", "alanine transaminase"),
            "U/L", 7, 56, crit_high=1000, plausible=(1, 10000),
            explain_high="Raised ALT suggests liver cell irritation, e.g. fatty liver, alcohol, medicines or hepatitis."),
    LabSpec("ast", "AST (SGOT)", ("ast", "sgot", "aspartate aminotransferase", "aspartate transaminase"),
            "U/L", 10, 40, crit_high=1000, plausible=(1, 10000),
            explain_high="Raised AST can come from the liver or muscles."),
    LabSpec("bilirubin_total", "Total bilirubin", ("total bilirubin", "bilirubin total", "bilirubin, total", "bilirubin"),
            "mg/dL", 0.1, 1.2, crit_high=15, plausible=(0, 50),
            explain_high="Raised bilirubin can cause jaundice and may reflect liver or blood-cell breakdown problems."),
    LabSpec("vitamin_d", "Vitamin D (25-OH)", ("25-oh vitamin d", "25 oh vitamin d", "25-hydroxy vitamin d", "vitamin d3", "vitamin d", "vit d"),
            "ng/mL", 30, 100, crit_low=10, plausible=(1, 300),
            explain_low="Low vitamin D is common and can affect bone and muscle health."),
    LabSpec("vitamin_b12", "Vitamin B12", ("vitamin b12", "vit b12", "b12", "cobalamin"),
            "pg/mL", 200, 900, plausible=(10, 5000),
            explain_low="Low B12 can cause anaemia, tiredness and tingling in hands or feet."),
    LabSpec("ferritin", "Ferritin", ("serum ferritin", "ferritin"),
            "ng/mL", 15, 300, plausible=(1, 10000),
            explain_low="Low ferritin indicates low iron stores.",
            explain_high="High ferritin can reflect inflammation or iron overload."),
    LabSpec("sodium", "Sodium", ("sodium", "na+", "serum sodium"),
            "mmol/L", 135, 145, crit_low=125, crit_high=155, plausible=(90, 200)),
    LabSpec("potassium", "Potassium", ("potassium", "k+", "serum potassium"),
            "mmol/L", 3.5, 5.0, crit_low=2.5, crit_high=6.5, plausible=(1, 12)),
    LabSpec("crp", "C-reactive protein", ("c-reactive protein", "c reactive protein", "crp"),
            "mg/L", None, 10, plausible=(0, 600),
            explain_high="Raised CRP is a non-specific marker of inflammation or infection."),
    LabSpec("esr", "ESR", ("erythrocyte sedimentation rate", "esr"),
            "mm/hr", 0, 20, plausible=(0, 200),
            explain_high="Raised ESR is a non-specific marker of inflammation."),
    LabSpec("uric_acid", "Uric acid", ("serum uric acid", "uric acid"),
            "mg/dL", 3.4, 7.0, plausible=(0.5, 25),
            explain_high="High uric acid can lead to gout and kidney stones."),
    LabSpec("spo2", "Oxygen saturation (SpO2)", ("spo2", "oxygen saturation", "o2 saturation"),
            "%", 95, 100, crit_low=90, plausible=(40, 100),
            explain_low="Low oxygen saturation needs prompt medical assessment."),
    LabSpec("heart_rate", "Heart rate", ("heart rate", "pulse rate", "pulse"),
            "bpm", 60, 100, crit_low=40, crit_high=130, plausible=(20, 250)),
)

BP_SYSTOLIC = LabSpec("bp_systolic", "Systolic blood pressure", (), "mmHg", 90, 129, crit_low=80, crit_high=180, plausible=(50, 300),
                      explain_high="Systolic pressure of 130 mmHg or more on repeated readings is generally considered high blood pressure.")
BP_DIASTOLIC = LabSpec("bp_diastolic", "Diastolic blood pressure", (), "mmHg", 60, 84, crit_high=120, plausible=(30, 200),
                       explain_high="Raised diastolic pressure on repeated readings indicates hypertension.")

SPEC_BY_KEY = {s.key: s for s in LAB_SPECS} | {BP_SYSTOLIC.key: BP_SYSTOLIC, BP_DIASTOLIC.key: BP_DIASTOLIC}

_NUM = r"(\d{1,7}(?:[.,]\d{1,3})?)"
_UNIT = r"\s*(%|[a-zA-Zµμ/^0-9.\-]{1,14}(?:/[a-zA-Zµμ0-9.]{1,6})?)?"
_BP_RE = re.compile(r"(?:blood\s*pressure|\bbp\b)[^0-9\n]{0,20}(\d{2,3})\s*/\s*(\d{2,3})", re.I)


def _alias_regex(alias: str) -> re.Pattern[str]:
    esc = re.escape(alias).replace(r"\ ", r"\s*")
    # Alias, then up to 40 chars of non-digit filler (e.g. ", fasting (mg/dL):"), then the number.
    # An optional parenthetical right after the name (e.g. "(25-OH)", "(SGPT)") is skipped.
    return re.compile(rf"(?<![a-z0-9]){esc}(?![a-z0-9])\s*(?:\([^)\n]{{0,25}}\))?[^0-9\n]{{0,40}}?{_NUM}{_UNIT}", re.I)


_COMPILED: list[tuple[LabSpec, re.Pattern[str]]] = []
for _spec in LAB_SPECS:
    for _alias in sorted(_spec.aliases, key=len, reverse=True):
        _COMPILED.append((_spec, _alias_regex(_alias)))
# Longer aliases first across all specs so "hemoglobin a1c" wins over "hemoglobin".
_COMPILED.sort(key=lambda t: len(t[1].pattern), reverse=True)


def range_for(spec: LabSpec, sex: str | None) -> tuple[float | None, float | None]:
    if sex and sex in spec.sex_ranges:
        return spec.sex_ranges[sex]
    return spec.low, spec.high


def classify(spec: LabSpec, value: float, sex: str | None = None) -> str:
    low, high = range_for(spec, sex)
    if spec.crit_low is not None and value < spec.crit_low:
        return "critical_low"
    if spec.crit_high is not None and value > spec.crit_high:
        return "critical_high"
    if low is not None and value < low:
        return "low"
    if high is not None and value > high:
        return "high"
    return "normal"


def _to_float(s: str) -> float:
    return float(s.replace(",", "."))


def _normalise_units(spec: LabSpec, value: float, unit: str | None) -> tuple[float, str]:
    u = (unit or "").lower()
    if spec.key.startswith("glucose") and "mmol" in u:
        return round(value * 18.0, 1), "mg/dL"
    if spec.key in {"total_cholesterol", "ldl", "hdl"} and "mmol" in u:
        return round(value * 38.67, 1), "mg/dL"
    if spec.key == "triglycerides" and "mmol" in u:
        return round(value * 88.57, 1), "mg/dL"
    if spec.key == "hemoglobin" and u in {"g/l"}:
        return round(value / 10, 2), "g/dL"
    if spec.key in {"wbc", "platelets"} and value > 1000:  # reported per µL, e.g. 7500 or 250000
        return round(value / 1000, 1), spec.unit
    return value, spec.unit


def _make(spec: LabSpec, value: float, raw: str, sex: str | None) -> dict:
    low, high = range_for(spec, sex)
    return {
        "test": spec.name,
        "key": spec.key,
        "value": value,
        "unit": spec.unit,
        "ref_low": low,
        "ref_high": high,
        "status": classify(spec, value, sex),
        "raw": raw.strip()[:160],
        "explanation": (spec.explain_low if value < (low or float("-inf")) else spec.explain_high if value > (high or float("inf")) else ""),
    }


_STARTS_NUM = re.compile(r"^\s*[<>]?\s*\d")


def _logical_lines(text: str) -> list[str]:
    """Join label-only lines with a following value line. PDF text extraction
    often yields "Hemoglobin:" and "10.8 g/dL" on separate lines."""
    raw = [ln.strip() for ln in text.splitlines()]
    out: list[str] = []
    i = 0
    while i < len(raw):
        ln = raw[i]
        nxt = raw[i + 1] if i + 1 < len(raw) else ""
        if ln and nxt and _STARTS_NUM.match(nxt) and (ln.endswith(":") or not re.search(r"\d", ln)):
            out.append(f"{ln} {nxt}")
            i += 2
            continue
        out.append(ln)
        i += 1
    return out


def parse_lab_values(text: str | None, sex: str | None = None) -> list[dict]:
    """Return a list of recognised lab values (first occurrence of each test wins)."""
    if not text:
        return []
    found: dict[str, dict] = {}
    for line in _logical_lines(text):
        line_clean = line.strip()
        if not line_clean:
            continue
        m = _BP_RE.search(line_clean)
        if m:
            sys_v, dia_v = float(m.group(1)), float(m.group(2))
            if "bp_systolic" not in found and 50 <= sys_v <= 300 and 30 <= dia_v <= 200:
                found["bp_systolic"] = _make(BP_SYSTOLIC, sys_v, line_clean, sex)
                found["bp_diastolic"] = _make(BP_DIASTOLIC, dia_v, line_clean, sex)
            continue
        consumed: list[tuple[int, int]] = []
        for spec, rx in _COMPILED:
            if spec.key in found:
                continue
            for m in rx.finditer(line_clean):
                start, end = m.span()
                if any(not (end <= a or start >= b) for a, b in consumed):
                    continue
                try:
                    value = _to_float(m.group(1))
                except ValueError:
                    continue
                value, _unit = _normalise_units(spec, value, m.group(2))
                if not (spec.plausible[0] <= value <= spec.plausible[1]):
                    continue
                found[spec.key] = _make(spec, value, line_clean, sex)
                consumed.append((start, end))
                break
    return list(found.values())


def abnormal(values: list[dict]) -> list[dict]:
    return [v for v in values if v.get("status") != "normal"]


def reclassify(values: list[dict] | None, sex: str | None = None) -> list[dict]:
    """Re-apply ranges and status to stored lab values (e.g. after the patient's sex is set),
    without needing the original report text."""
    out = []
    for v in values or []:
        spec = SPEC_BY_KEY.get(v.get("key"))
        if spec and isinstance(v.get("value"), (int, float)):
            out.append(_make(spec, float(v["value"]), v.get("raw") or "", sex))
    return out
