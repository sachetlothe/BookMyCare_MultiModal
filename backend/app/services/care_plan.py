"""Personalised care-pathway recommendations built from screening results,
red flags and the patient profile. Recommendations are general guidance and
never include medicine names or doses."""
from __future__ import annotations

from app.services.safety import URGENCY_GUIDANCE
from app.services import specialty
from app.services.scoring import condition_by_key

FOLLOW_UP = {
    "emergency": "Now - do not wait for an appointment.",
    "urgent": "Within 24 hours.",
    "soon": "Within 2-3 days.",
    "routine": "Routine check-up, or sooner if symptoms persist beyond a week or worsen.",
}


def _dedupe(items: list[str]) -> list[str]:
    seen, out = set(), []
    for i in items:
        k = i.strip().lower()
        if k and k not in seen:
            seen.add(k)
            out.append(i.strip())
    return out


def build_care_plan(urgency: str, red_flags: list[dict], conditions: list[dict], abnormal_labs: list[dict], profile_ctx: dict) -> dict:
    immediate = [URGENCY_GUIDANCE[urgency]] + [f["message"] for f in red_flags if f["level"] in ("emergency", "urgent")]

    self_care: list[str] = []
    see_doctor: list[str] = []
    tests: list[str] = []
    specialists: list[str] = []
    for i, c in enumerate(conditions[:3]):
        if c["confidence"] == "low" and i > 0:
            continue
        cond = condition_by_key(c["key"]) or {}
        limit = None if i == 0 else 2  # full guidance for the top match, highlights for others
        self_care += cond.get("self_care", [])[:limit]
        see_doctor += cond.get("see_doctor_if", [])[:limit]
        tests += cond.get("suggested_tests", [])
        if cond:
            specialists.append(specialty.label_for_condition(c["key"]))

    personal: list[str] = []
    age, bmi = profile_ctx.get("age"), profile_ctx.get("bmi")
    if profile_ctx.get("is_pregnant"):
        personal.append("You are pregnant: tell every clinician, and avoid any new medicine or supplement unless your obstetric provider approves it.")
    if age is not None and age >= 65:
        personal.append("At 65+, infections and dehydration can become serious faster - use a lower threshold for seeing a doctor.")
    if age is not None and age < 18:
        personal.append("For people under 18, a parent or guardian should be involved and a paediatrician consulted.")
    if profile_ctx.get("smoker"):
        personal.append("Stopping smoking improves heart, lung and overall health; ask about quit-support services.")
    if bmi is not None and bmi >= 25:
        personal.append(f"Your BMI is {bmi}. Gradual weight reduction through diet and activity lowers risk of diabetes, high blood pressure and heart disease.")
    if profile_ctx.get("activity_level") == "low":
        personal.append("Build up towards 150 minutes of moderate activity (e.g. brisk walking) per week, as advised by WHO.")
    if profile_ctx.get("alcohol_use") == "regular":
        personal.append("Reducing alcohol intake benefits the liver, blood pressure and sleep.")
    if profile_ctx.get("allergies"):
        personal.append("Remind clinicians about your allergies: " + ", ".join(profile_ctx["allergies"]) + ".")
    if profile_ctx.get("current_medications"):
        personal.append("Bring your current medicine list to appointments and check with a pharmacist or doctor before starting anything new.")
    if profile_ctx.get("chronic_conditions"):
        personal.append("Keep monitoring your existing conditions (" + ", ".join(profile_ctx["chronic_conditions"][:4]) + ") and attend scheduled reviews.")

    if abnormal_labs:
        see_doctor.insert(0, "Share the out-of-range lab values highlighted in this report with your doctor.")

    return {
        "urgency": urgency,
        "follow_up": FOLLOW_UP[urgency],
        "immediate_actions": _dedupe(immediate),
        "self_care": _dedupe(self_care)[:8],
        "when_to_see_doctor": _dedupe(see_doctor)[:8],
        "suggested_tests": _dedupe(tests)[:8],
        "specialists": _dedupe(specialists)[:3],
        "personalised": _dedupe(personal),
    }
