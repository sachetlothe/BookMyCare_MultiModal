"""Multimodal analysis pipeline.

Inputs (symptoms, lab reports, medical images, profile, history) are processed
by independent, explainable modules and fused:

    symptoms ─┐
    reports ──┼─> rule-based scoring ─> red flags / urgency ─> care plan
    images ───┘          │                                        │
                         └──> WHO/CDC retrieval ──> grounded AI explanation (LLM, labelled mock, or none)

The AI provider only *explains* the structured results; it does not produce
the condition ranking (except optional, clearly-labelled image observations).
"""
from __future__ import annotations

import json
import logging
import time
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import registry
from app.ai.base import ImageInput, LLMRequest
from app.core.config import get_settings
from app.models import MedicalHistoryEntry, MedicalReport, User
from app.ai.mock import MOCK_NOTICE
from app.services import grounding, specialty
from app.services.care_plan import build_care_plan
from app.services.file_store import FileMissing, FileUnreadable, PatientKeyRequired, StorageError, get_file_store
from app.services.lab_parser import abnormal, reclassify
from app.services.safety import DISCLAIMER, URGENCY_GUIDANCE, detect_red_flags, sanitize_payload, urgency_from
from app.services.scoring import ENGINE_VERSION, condition_by_key, score_conditions
from app.services.symptoms import LABELS, normalise
from app.services.trends import compute_trends, trend_signals

log = logging.getLogger(__name__)


class AnalysisInputError(ValueError):
    pass


def compute_age(dob: date | None, today: date | None = None) -> int | None:
    if not dob:
        return None
    today = today or date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def compute_bmi(height_cm: float | None, weight_kg: float | None) -> float | None:
    if not height_cm or not weight_kg:
        return None
    return round(weight_kg / (height_cm / 100) ** 2, 1)


def profile_context(user: User, db: Session) -> dict:
    p = user.profile
    history = db.scalars(select(MedicalHistoryEntry).where(MedicalHistoryEntry.user_id == user.id)).all()
    chronic = list(p.chronic_conditions or []) if p else []
    chronic += [h.title for h in history if h.category == "condition" and h.is_ongoing and "family" not in (h.title + (h.details or "")).lower()]
    family = [f"{h.title} {h.details or ''}" for h in history if "family" in (h.title + " " + (h.details or "")).lower()]
    allergies = list(p.allergies or []) if p else []
    allergies += [h.title for h in history if h.category == "allergy"]
    meds = list(p.current_medications or []) if p else []
    meds += [h.title for h in history if h.category == "medication" and h.is_ongoing]
    return {
        "age": compute_age(p.date_of_birth) if p else None,
        "sex": p.sex if p else None,
        "bmi": compute_bmi(p.height_cm, p.weight_kg) if p else None,
        "is_pregnant": bool(p and p.is_pregnant),
        "smoker": bool(p and p.smoker),
        "alcohol_use": p.alcohol_use if p else None,
        "activity_level": p.activity_level if p else None,
        "chronic_conditions": list(dict.fromkeys(chronic)),
        "allergies": list(dict.fromkeys(allergies)),
        "current_medications": list(dict.fromkeys(meds)),
        "family_history": family,
    }


SYSTEM_PROMPT = """You are the explanation module of BookMyCare, a patient-education screening tool. You do NOT diagnose.
You receive JSON: rule-based screening results (urgency, red flags, possible conditions with the evidence for and against each,
lab values, "lab_trends" (changes across the patient's earlier reports), the patient's history) and numbered evidence passages from WHO/CDC with ids such as "S1".
Rules:
1. "urgency" and "red_flags" are fixed by safety rules. Never change, soften or contradict them, and never say the patient does not need to see a doctor.
2. Never state or imply a diagnosis. Use wording such as "may be consistent with" and "a doctor can confirm". Only discuss conditions listed in "conditions", and refer to them by their "key".
3. Use only the provided data and passages. When you give general medical information, put the id of the supporting passage in "cites". If no passage supports a statement, leave "cites" empty. Never invent sources, ids or URLs.
4. Take the patient's history (chronic conditions, medicines, allergies, family history, pregnancy) into account. Never recommend medicines, doses or changing treatment.
5. Be explicit about uncertainty: what is missing, ambiguous or weakly supported.
6. Write plain language for a patient (reading age about 14).
7. When "lab_trends" is not empty, mention the most important change over time in "report_interpretation". Describe it as a change in results, not as proof of a cause, and never say a medicine caused it.
Reply with ONLY a JSON object: {"summary": string (max 120 words), "report_interpretation": string (max 100 words, "" if there are no labs),
"condition_notes": [{"key": string, "explanation": string (max 60 words), "cites": [string]}],
"uncertainty": [string] (max 4), "questions_for_doctor": [string] (3 to 5)}"""

IMAGE_SYSTEM_PROMPT = """You describe medical images for a patient-education prototype. You are not a radiologist and
must not diagnose. Describe only clearly visible, general observations (e.g. image type, body region, visible
abnormal-looking areas) and image quality. Respond with JSON: {"image_type": str, "observations": [str],
"possible_findings": [short neutral terms such as "consolidation", "rash", "pallor"], "quality": str,
"limitations": str}. If unsure, return empty lists."""


def _load_reports(db: Session, user: User, ids: list[int], kind: str) -> list[MedicalReport]:
    if not ids:
        return []
    rows = db.scalars(select(MedicalReport).where(MedicalReport.user_id == user.id, MedicalReport.id.in_(ids))).all()
    found = {r.id for r in rows}
    missing = [i for i in ids if i not in found]
    if missing:
        raise AnalysisInputError(f"Unknown file id(s): {missing}")
    wrong = [r.id for r in rows if r.kind != kind]
    if wrong:
        raise AnalysisInputError(f"File id(s) {wrong} are not of type '{kind}'")
    return list(rows)


def _image_observations(images: list[MedicalReport], file_key: bytes | None = None) -> tuple[list[dict], list[str], dict | None]:
    """Run optional AI image observation. Returns (per-image results, finding terms, provider info)."""
    results, findings = [], []
    provider_info = None
    for img in images:
        entry = {
            "report_id": img.id,
            "title": img.title,
            "report_type": img.report_type,
            "quality": img.image_features or {},
            "ai_observation": None,
        }
        try:
            data = get_file_store().load(img.stored_filename, file_key)
        except PatientKeyRequired:
            entry["error"] = "Sign in again to let the analysis open this image."
            results.append(entry)
            continue
        except (FileMissing, FileUnreadable, StorageError):
            entry["error"] = "Stored image file is missing or cannot be decrypted."
            results.append(entry)
            continue
        req = LLMRequest(
            task="image_observation", system=IMAGE_SYSTEM_PROMPT,
            prompt=f"Image labelled by the patient as: {img.report_type or 'unspecified'} - {img.title}.",
            images=[ImageInput(img.content_type, data)], max_tokens=600,
        )
        try:
            outcome = registry.generate(req)
        except registry.AllProvidersFailed as exc:
            entry["error"] = "AI image observation unavailable: " + grounding.failure_message(exc.attempts)
            results.append(entry)
            continue
        resp = outcome.response
        provider_info = {"provider": resp.provider, "model": resp.model, "is_mock": resp.is_mock, "attempts": outcome.attempts}
        obs = resp.data or {}
        obs, removed = sanitize_payload(obs)
        entry["ai_observation"] = {
            "provider": resp.provider,
            "is_mock": resp.is_mock,
            "observations": [str(o) for o in obs.get("observations", [])][:8],
            "possible_findings": [str(o) for o in obs.get("possible_findings", [])][:8],
            "note": obs.get("note") or obs.get("limitations"),
            "quality": obs.get("quality"),
            "unverified": True,
            "failures": [{"provider": a["provider"], "kind": a.get("kind")} for a in outcome.attempts if not a.get("ok")],
        }
        if not resp.is_mock:
            findings.extend(entry["ai_observation"]["possible_findings"])
        results.append(entry)
    return results, findings, provider_info


def run_analysis(db: Session, user: User, payload, file_key: bytes | None = None) -> dict:
    t0 = time.perf_counter()
    reports = _load_reports(db, user, payload.report_ids, "report")
    images = _load_reports(db, user, payload.image_ids, "image")
    symptoms = normalise(payload.symptoms, payload.symptom_text)
    if not symptoms and not reports and not images:
        raise AnalysisInputError("Provide at least one symptom, a medical report or a medical image.")

    pctx = profile_context(user, db)

    # Labs: stored values re-classified with the patient's sex so sex-specific ranges apply.
    # (The report text is sealed with the patient's key and is not needed here.)
    labs: list[dict] = []
    report_summaries = []
    seen_keys: set[str] = set()
    for r in sorted(reports, key=lambda r: (r.report_date or date.min, r.id), reverse=True):
        vals = reclassify(r.lab_values, pctx["sex"])
        for v in vals:
            if v["key"] not in seen_keys:  # most recent report wins
                v["report_id"] = r.id
                labs.append(v)
                seen_keys.add(v["key"])
        report_summaries.append({"report_id": r.id, "title": r.title, "extraction_status": r.extraction_status, "lab_count": len(vals)})
    abnormal_labs = abnormal(labs)

    image_results, image_findings, image_provider = _image_observations(images, file_key)

    # Longitudinal evidence from all of the patient's stored lab results (not only the selected reports).
    trends = [t for t in compute_trends(db, user.id, pctx["sex"]) if t["n"] >= 2]
    signals = trend_signals(trends)

    conditions = score_conditions(symptoms, labs, pctx, payload.duration_days, image_findings, trends=signals)
    red_flags = detect_red_flags(symptoms, labs, pctx, payload.severity, payload.duration_days)
    urgency = urgency_from(red_flags, conditions, abnormal_labs)
    care_plan = build_care_plan(urgency, red_flags, conditions, abnormal_labs, pctx)
    care_plan["specialty_recommendations"] = specialty.recommend(conditions, urgency, trends)

    # Evidence: WHO/CDC passages for each condition, red flag and history item (numbered S1, S2...)
    symptom_labels = [LABELS.get(k, k) for k in symptoms]
    sources, cond_evidence = grounding.gather_evidence(db, conditions, symptom_labels, abnormal_labs, pctx, red_flags)

    context = grounding.build_context(
        urgency=urgency, red_flags=red_flags, symptom_labels=symptom_labels, conditions=conditions, labs=labs,
        pctx=pctx, sources=sources, cond_evidence=cond_evidence, abnormal_labs=abnormal_labs, trends=trends,
    )
    explanation, ai = _explain(
        urgency=urgency, red_flags=red_flags, abnormal_labs=abnormal_labs, labs=labs, conditions=conditions,
        sources=sources, context=context,
    )

    data_completeness = {
        "symptoms": bool(symptoms),
        "lab_values": bool(labs),
        "lab_history": bool(trends),
        "images": bool(images),
        "profile": bool(pctx["age"] is not None and pctx["sex"]),
    }
    limitations = [
        "Condition matches come from a transparent rule-based knowledge base with hand-set weights; they are not clinically validated and are not probabilities.",
        "Only conditions in the BookMyCare knowledge base can be suggested; your actual condition may not be listed.",
    ]
    if ai["status"] == "generated":
        limitations.append("The AI-written explanation is generated text constrained to the rule-based results and the retrieved WHO/CDC passages; it can still contain mistakes and is not medical advice.")
    elif ai["status"] == "skipped_emergency":
        limitations.append("Because emergency warning signs were detected, no AI model was used; the guidance comes directly from safety rules.")
    if images:
        limitations.append(
            "Medical images are checked for quality only." if all((ir.get("ai_observation") or {}).get("is_mock", True) for ir in image_results)
            else "AI image observations come from a general-purpose vision model, are unverified, and carry only small weight."
        )
    if trends:
        limitations.append("Trends compare results from different reports and possibly different laboratories; small differences can come from the test method rather than a real change.")
    if not labs and reports:
        limitations.append("No lab values could be read from the selected reports.")
    if not data_completeness["profile"]:
        limitations.append("Adding your age and sex to your profile improves reference ranges and personalisation.")

    assessment = grounding.build_assessment(
        urgency=urgency, red_flags=red_flags, conditions=conditions, pctx=pctx, sources=sources,
        cond_evidence=cond_evidence, explanation=explanation, ai=ai, care_plan=care_plan, limitations=limitations,
        data_completeness=data_completeness, abnormal_lab_count=len(abnormal_labs),
    )
    return {
        "disclaimer": DISCLAIMER,
        "is_mock": ai["status"] == "mock",
        "ai": ai,
        "urgency": urgency,
        "urgency_guidance": URGENCY_GUIDANCE[urgency],
        "red_flags": red_flags,
        "symptoms": [{"key": k, "label": LABELS.get(k, k)} for k in symptoms],
        "conditions": conditions,
        "lab_values": labs,
        "trends": trends[:12],
        "abnormal_lab_count": len(abnormal_labs),
        "reports": report_summaries,
        "images": image_results,
        "care_plan": care_plan,
        "sources": sources,
        "explanation": explanation,
        "assessment": assessment,
        "data_completeness": data_completeness,
        "limitations": limitations,
        "provenance": {
            "engine_version": ENGINE_VERSION,
            "explanation_provider": ai["provider"],
            "explanation_model": ai["model"],
            "provider_attempts": ai["attempts"],
            "image_provider": image_provider,
            "duration_ms": round((time.perf_counter() - t0) * 1000),
        },
    }


def _explain(*, urgency: str, red_flags: list[dict], abnormal_labs: list[dict], labs: list[dict], conditions: list[dict],
             sources: list[dict], context: dict) -> tuple[dict, dict]:
    """Produce the patient-facing explanation and an explicit AI-status block.

    Urgency is never taken from the model. Emergency results skip the model entirely.
    Mock/template output and provider failures are always labelled in the returned ``ai`` block.
    """
    s = get_settings()
    if urgency == "emergency":
        notice = "Emergency warning signs were detected, so this guidance comes directly from safety rules. No AI model was used for the explanation."
        expl = grounding.rules_explanation(urgency, red_flags, abnormal_labs, len(labs), notice)
        expl["safety_filtered_sentences"] = 0
        return expl, grounding.ai_block(status="skipped_emergency", provider="rules", model="safety-rules-v1",
                                        reason="emergency", message=notice, attempts=[])

    av = registry.availability()
    req = LLMRequest(
        task="analysis_explanation", system=SYSTEM_PROMPT,
        prompt="Screening results (JSON):\n" + json.dumps(context, ensure_ascii=False),
        context=context, max_tokens=s.ai_max_output_tokens, temperature=0.2,
    )
    try:
        outcome = registry.generate(req, validate=grounding.validate_ai_response)
    except registry.AllProvidersFailed as exc:
        reason = av["reason"] or "all_providers_failed"
        msg = "AI explanation unavailable: " + grounding.failure_message(exc.attempts, av["reason"])
        expl = grounding.rules_explanation(urgency, red_flags, abnormal_labs, len(labs), msg)
        expl["safety_filtered_sentences"] = 0
        return expl, grounding.ai_block(status="failed", provider="none", model="", reason=reason, message=msg, attempts=exc.attempts)

    resp = outcome.response
    expl, removed = grounding.clean_ai_output(resp.data or {}, conditions=conditions, source_ids={x["id"] for x in sources}, urgency=urgency)
    expl["safety_filtered_sentences"] = removed
    if not expl["summary"]:
        expl["summary"] = URGENCY_GUIDANCE[urgency]
    if resp.is_mock:
        why = grounding.failure_message(outcome.attempts, av["reason"])
        reason = "all_providers_failed" if av["real_configured"] else (av["reason"] or "mock")
        msg = f"Real AI was not used: {why} Showing a template summary built from the rule-based results."
        expl["notice"] = f"{MOCK_NOTICE} {why}"
        return expl, grounding.ai_block(status="mock", provider=resp.provider, model=resp.model, reason=reason, message=msg, attempts=outcome.attempts)
    return expl, grounding.ai_block(status="generated", provider=resp.provider, model=resp.model, reason=None, message=None, attempts=outcome.attempts)
