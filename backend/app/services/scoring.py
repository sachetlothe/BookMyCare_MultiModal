"""Explainable, rule-based condition screening.

Every point a condition receives is recorded as a *factor* with its source
(symptom, lab, risk factor, duration, image) so the UI can show exactly why a
condition was suggested. Scores are heuristic evidence-match scores, not
calibrated probabilities of disease.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from app.services import specialty
from app.services.lab_parser import SPEC_BY_KEY
from app.services.symptoms import LABELS

DATA = Path(__file__).resolve().parents[1] / "data"
ENGINE_VERSION = "rules-1.1"  # 1.1: lab-history trends as evidence


@lru_cache
def load_conditions() -> list[dict]:
    with open(DATA / "conditions.json", encoding="utf-8") as f:
        return json.load(f)["conditions"]


def condition_by_key(key: str) -> dict | None:
    return next((c for c in load_conditions() if c["key"] == key), None)


# Share of a lab rule's weight added for a trend in the expected direction (hand-set, not validated).
TREND_WEIGHTS = {"worsening": 0.4, "approaching_limit": 0.25, "persistent": 0.3, "cap": 0.6, "improving": 0.2}

# Keyword map for (unverified) AI image observations -> condition evidence.
IMAGE_FINDING_MAP: dict[str, tuple[str, float]] = {
    "consolidation": ("pneumonia", 1.5),
    "infiltrate": ("pneumonia", 1.5),
    "opacity": ("pneumonia", 1.0),
    "cavity": ("tuberculosis", 1.5),
    "cavitation": ("tuberculosis", 1.5),
    "pallor": ("iron_deficiency_anaemia", 1.0),
    "jaundice": ("liver_dysfunction", 1.5),
    "icterus": ("liver_dysfunction", 1.5),
    "rash": ("dengue", 0.5),
}


def _severity(lab: dict) -> str:
    """critical / marked / mild (within 15% beyond the reference limit)."""
    if lab["status"].startswith("critical"):
        return "critical"
    v = lab["value"]
    if lab["status"] == "high" and lab.get("ref_high"):
        return "mild" if v <= lab["ref_high"] * 1.15 else "marked"
    if lab["status"] == "low" and lab.get("ref_low"):
        return "mild" if v >= lab["ref_low"] * 0.85 else "marked"
    return "marked"


def _has_term(items: list[str], term: str) -> bool:
    aliases = {
        "diabetes": ("diabet", "sugar"),
        "hypertension": ("hypertens", "high blood pressure", "bp"),
        "allergy": ("allerg", "hay fever", "eczema"),
        "hiv": ("hiv",),
    }.get(term, (term,))
    low = [i.lower() for i in items]
    return any(a in i for i in low for a in aliases)


def eval_risk_factor(factor: str, ctx: dict) -> tuple[bool, str]:
    age, bmi = ctx.get("age"), ctx.get("bmi")
    if factor == "age_over_45":
        return (age is not None and age >= 45), f"Age {age}"
    if factor == "age_over_65":
        return (age is not None and age >= 65), f"Age {age}"
    if factor == "bmi_over_25":
        return (bmi is not None and 25 <= bmi < 30), f"BMI {bmi}"
    if factor == "bmi_over_30":
        return (bmi is not None and bmi >= 30), f"BMI {bmi}"
    if factor == "smoker":
        return bool(ctx.get("smoker")), "Smoker"
    if factor == "alcohol_regular":
        return ctx.get("alcohol_use") == "regular", "Regular alcohol use"
    if factor == "low_activity":
        return ctx.get("activity_level") == "low", "Low physical activity"
    if factor == "sex_female":
        return ctx.get("sex") == "female", "Female sex"
    if factor == "pregnant":
        return bool(ctx.get("is_pregnant")), "Pregnancy"
    if factor.startswith("chronic:"):
        term = factor.split(":", 1)[1]
        return _has_term(ctx.get("chronic_conditions", []), term), f"History of {term}"
    if factor.startswith("family:"):
        term = factor.split(":", 1)[1]
        fam = [h for h in ctx.get("family_history", [])]
        return _has_term(fam, term), f"Family history of {term}"
    return False, factor


def score_conditions(
    symptom_keys: list[str],
    labs: list[dict],
    profile_ctx: dict,
    duration_days: int | None = None,
    image_findings: list[str] | None = None,
    top_n: int = 5,
    trends: list[dict] | None = None,
) -> list[dict]:
    lab_by_key = {l["key"]: l for l in labs}
    trend_by_key = {t["key"]: t for t in trends or []}
    sym_set = set(symptom_keys)
    results = []
    for cond in load_conditions():
        factors: list[dict] = []
        sym_pts = lab_pts = 0.0

        for s_key, w in cond["symptoms"].items():
            if s_key in sym_set:
                sym_pts += w
                factors.append({"type": "symptom", "label": LABELS.get(s_key, s_key), "points": w, "direction": "supports"})

        for rule in cond["labs"]:
            lab = lab_by_key.get(rule["key"])
            if not lab:
                continue
            spec = SPEC_BY_KEY.get(rule["key"])
            name = spec.name if spec else rule["key"]
            status = lab["status"]
            if status.endswith(rule["status"]):
                sev = _severity(lab)
                w = rule["weight"] * {"critical": 1.25, "marked": 1.0, "mild": 0.7}[sev]
                lab_pts += w
                desc = status.replace("_", " ") if sev != "mild" else f"mildly {status}"
                factors.append({"type": "lab", "label": f"{name} {lab['value']} {lab.get('unit') or ''} ({desc})".replace("  ", " "), "points": round(w, 2), "direction": "supports"})
            elif status == "normal" and rule["weight"] >= 2:
                w = -0.5 * rule["weight"]
                lab_pts += w
                factors.append({"type": "lab", "label": f"{name} {lab['value']} {lab.get('unit') or ''} is in the normal range".replace("  ", " "), "points": round(w, 2), "direction": "against"})

        # Lab history (lab_results over time): worsening, persistent or approaching-limit trends in the
        # direction this condition expects add a little evidence; improving trends count against.
        trend_pts = 0.0
        for rule in cond["labs"]:
            t = trend_by_key.get(rule["key"])
            if not t or t["toward"] != rule["status"]:
                continue
            w = 0.0
            if t["assessment"] == "worsening":
                w += TREND_WEIGHTS["worsening"]
            elif t["assessment"] == "approaching_limit":
                w += TREND_WEIGHTS["approaching_limit"]
            if t["persistent_count"] >= 2:
                w += TREND_WEIGHTS["persistent"]
            if w:
                w = round(min(w, TREND_WEIGHTS["cap"]) * rule["weight"], 2)
                trend_pts += w
                label = t["summary"] if t["assessment"] in ("worsening", "approaching_limit") else t.get("persistent_text") or t["summary"]
                factors.append({"type": "trend", "label": f"Trend: {label}", "points": w, "direction": "supports"})
            elif t["assessment"] == "improving":
                w = round(-TREND_WEIGHTS["improving"] * rule["weight"], 2)
                trend_pts += w
                factors.append({"type": "trend", "label": f"Improving trend: {t['summary']}", "points": w, "direction": "against"})

        img_pts = 0.0
        for finding in image_findings or []:
            for kw, (ckey, w) in IMAGE_FINDING_MAP.items():
                if ckey == cond["key"] and kw in finding.lower():
                    img_pts += w
                    factors.append({"type": "image", "label": f"AI image observation (unverified): {finding[:80]}", "points": w, "direction": "supports"})
                    break

        evidence = sym_pts + max(lab_pts, 0) + img_pts + max(trend_pts, 0)
        if evidence <= 0:
            continue

        risk_pts = 0.0
        for rf in cond.get("risk_factors", []):
            ok, label = eval_risk_factor(rf["factor"], profile_ctx)
            if ok:
                risk_pts += rf["weight"]
                factors.append({"type": "risk_factor", "label": label, "points": rf["weight"], "direction": "supports"})

        dur_pts = 0.0
        multiplier = 1.0
        if duration_days is not None:
            if cond.get("min_days") and duration_days >= cond["min_days"]:
                dur_pts = cond.get("duration_weight", 1.0)
                factors.append({"type": "duration", "label": f"Symptoms for {duration_days} days (≥ {cond['min_days']})", "points": dur_pts, "direction": "supports"})
            if cond.get("max_days") and duration_days > cond["max_days"]:
                multiplier *= 0.6
                factors.append({"type": "duration", "label": f"Symptoms for {duration_days} days is longer than typical for this condition", "points": 0, "direction": "against"})

        key_syms = cond.get("key_symptoms") or []
        if key_syms and not (sym_set & set(key_syms)) and lab_pts <= 0 and img_pts <= 0 and trend_pts <= 0:
            multiplier *= 0.5
            factors.append({"type": "missing", "label": "Typical key symptoms not reported: " + ", ".join(LABELS.get(k, k) for k in key_syms), "points": 0, "direction": "against"})

        total = (sym_pts + lab_pts + img_pts + trend_pts + risk_pts + dur_pts) * multiplier
        if total <= 0:
            continue
        # Two components: (1) saturation - how much evidence in absolute terms;
        # (2) coverage - what fraction of this condition's characteristic
        # features (that could be observed) are actually present.
        saturation = 1 - math.exp(-1.6 * total / cond["scale"])
        sym_total = sum(cond["symptoms"].values())
        lab_present_total = sum(r["weight"] for r in cond["labs"] if r["key"] in lab_by_key)
        lab_pos = sum(f["points"] for f in factors if f["type"] == "lab" and f["points"] > 0)
        if cond.get("requires_lab_confirmation") and lab_present_total > 0:
            # A single test counts for less than a full panel.
            lab_all = sum(r["weight"] for r in cond["labs"])
            coverage = min(1.0, lab_pos / max(lab_present_total, 0.6 * lab_all))
        else:
            denom = sym_total + lab_present_total
            coverage = min(1.0, (sym_pts + lab_pos + img_pts) / denom) if denom else 0.0
        match = (0.5 * saturation + 0.5 * coverage) * (multiplier if multiplier < 1 else 1)

        notes = []
        if cond.get("requires_lab_confirmation") and lab_pts <= 0:
            match = min(match, 0.45)
            notes.append("This condition can only be assessed properly with blood tests.")

        evidence_types = sum(x > 0 for x in (sym_pts, lab_pts, img_pts))
        lab_defined = bool(cond.get("requires_lab_confirmation")) and lab_pts > 0
        if match >= 0.7 and (evidence_types >= 2 or (lab_defined and match >= 0.75)):
            confidence = "high"
        elif match >= 0.45:
            confidence = "moderate"
        else:
            confidence = "low"

        positive = sum(f["points"] for f in factors if f["points"] > 0) or 1
        for f in factors:
            f["share"] = round(max(f["points"], 0) / positive, 3)
        factors.sort(key=lambda f: (-f["points"], f["type"]))

        missing_supportive = [LABELS.get(k, k) for k, w in sorted(cond["symptoms"].items(), key=lambda kv: -kv[1]) if k not in sym_set and w >= 1.5][:4]

        results.append({
            "key": cond["key"],
            "name": cond["name"],
            "category": cond["category"],
            "description": cond["description"],
            "match_score": round(match, 3),
            "score_components": {"saturation": round(saturation, 3), "coverage": round(coverage, 3)},
            "confidence": confidence,
            "evidence_points": round(total, 2),
            "factors": factors,
            "not_reported": missing_supportive,
            "suggested_tests": cond.get("suggested_tests", []),
            "specialist": specialty.label_for_condition(cond["key"]),
            "specialties": specialty.specialties_for_condition(cond["key"]),
            "notes": notes,
        })
    results.sort(key=lambda r: -r["match_score"])
    return [r for r in results if r["match_score"] >= 0.2][:top_n]
