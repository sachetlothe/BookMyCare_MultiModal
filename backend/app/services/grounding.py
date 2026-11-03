"""Evidence grounding and structured assessment.

Pipeline position (see analysis_engine.run_analysis):

    rule-based scoring + safety + care plan   (deterministic, decide urgency)
            |
    gather_evidence()   WHO/CDC passages per condition, per red flag and per
            |           history item, each with a stable id (S1, S2 ...)
    LLM explanation     receives the structured results + numbered passages
            |
    clean_ai_output()   drops invalid citations, unknown conditions, diagnostic
            |           assertions, dosing and "no need to see a doctor" text
    build_assessment()  one structured block for the UI

The language model never sets urgency, never adds conditions and its
citations are accepted only if they point at a passage that was really
retrieved (so every displayed source has a genuine WHO/CDC URL).
"""
from __future__ import annotations

import re
from functools import lru_cache

from sqlalchemy.orm import Session

from app.ai.base import LLMResponse, ProviderError
from app.services import retrieval
from app.services.safety import URGENCY_GUIDANCE, sanitize_text
from app.services.scoring import condition_by_key, load_conditions

MAX_SOURCES = 8

# Condition key -> words in the patient's own history that mean the condition is already known.
KNOWN_HISTORY_TERMS: dict[str, tuple[str, ...]] = {
    "type_2_diabetes": ("diabet",),
    "hypertension": ("hypertens", "high blood pressure"),
    "asthma": ("asthma",),
    "chronic_kidney_disease": ("kidney", "ckd", "renal"),
    "hypothyroidism": ("thyroid",),
    "depression": ("depress",),
    "migraine": ("migraine",),
    "tuberculosis": ("tuberculosis",),
    "iron_deficiency_anaemia": ("anaemia", "anemia"),
    "hyperlipidaemia": ("cholesterol", "lipid"),
    "liver_dysfunction": ("liver", "hepatitis"),
}
# History words -> knowledge-base topic, used to pull evidence relevant to the patient's own conditions.
HISTORY_TOPICS: dict[str, str] = {
    "diabet": "type_2_diabetes", "hypertens": "hypertension", "high blood pressure": "hypertension",
    "asthma": "asthma", "kidney": "chronic_kidney_disease", "cholesterol": "hyperlipidaemia",
    "anaemia": "iron_deficiency_anaemia", "anemia": "iron_deficiency_anaemia", "liver": "liver",
    "hepatitis": "hepatitis", "tuberculosis": "tuberculosis", "depress": "mental_health",
    "migraine": "migraine", "heart": "cardiovascular", "stroke": "stroke",
}

KIND_MESSAGES = {
    "missing_key": "No AI provider key is configured (add GEMINI_API_KEY to backend/.env and restart the backend).",
    "forced_mock": "AI_FORCE_MOCK is enabled, so no real AI provider is used.",
    "rate_limited": "The AI provider's rate limit or quota was reached. Try again later or use another provider.",
    "auth_error": "The AI provider rejected the API key (invalid, expired or not permitted).",
    "model_not_found": "The configured AI model was not found or has been retired. Check the model name in backend/.env.",
    "bad_request": "The AI provider rejected the request (check the model name and settings).",
    "server_error": "The AI provider reported a server error or high demand (503). Try again later or choose another model in GEMINI_MODEL.",
    "timeout": "The AI provider did not answer in time (the model may be overloaded; try another GEMINI_MODEL).",
    "network": "The AI provider could not be reached (network error).",
    "blocked": "The AI provider blocked the request or response.",
    "invalid_response": "The AI provider returned a response that failed validation.",
    "unsupported": "The provider does not support this request.",
    "error": "The AI provider returned an error.",
}


# --------------------------------------------------------------------------- evidence

def _history_terms(pctx: dict) -> list[str]:
    items = list(pctx.get("chronic_conditions", [])) + list(pctx.get("family_history", []))
    return [i.lower() for i in items]


def matching_history(cond_key: str, pctx: dict) -> list[str]:
    """The patient's own listed conditions that correspond to this screening condition."""
    terms = KNOWN_HISTORY_TERMS.get(cond_key, ())
    return [i for i in pctx.get("chronic_conditions", []) if any(t in i.lower() for t in terms)]


def known_in_history(cond_key: str, pctx: dict) -> bool:
    return bool(matching_history(cond_key, pctx))


def gather_evidence(db: Session, conditions: list[dict], symptom_labels: list[str], abnormal_labs: list[dict],
                    pctx: dict, red_flags: list[dict]) -> tuple[list[dict], dict[str, list[str]]]:
    """Return (numbered sources, {condition_key: [source ids]}). Only passages that
    actually exist in the knowledge base are returned."""
    docs: dict[str, dict] = {}
    cond_slugs: dict[str, list[str]] = {}

    def take(results: list[dict], reason: str, cond_key: str | None = None, limit: int = 2,
             require_topics: list[str] | None = None) -> None:
        n = 0
        for d in results:
            if require_topics is not None and not (set(d["topics"]) & set(require_topics)):
                continue
            slug = d["slug"]
            if slug not in docs:
                if len(docs) >= MAX_SOURCES:
                    continue
                docs[slug] = {**d, "reasons": []}
            if reason not in docs[slug]["reasons"]:
                docs[slug]["reasons"].append(reason)
            if cond_key:
                lst = cond_slugs.setdefault(cond_key, [])
                if slug not in lst:
                    lst.append(slug)
            n += 1
            if n >= limit:
                break

    # 1. evidence for each top condition (topic-matched, so it is about that condition)
    for c in conditions[:3]:
        topics = (condition_by_key(c["key"]) or {}).get("topics", [])
        if not topics:
            continue
        supporting = [f["label"] for f in c["factors"] if f["direction"] == "supports" and f["type"] in ("symptom", "lab")][:3]
        res = retrieval.search(db, " ".join([c["name"], *supporting]), k=6, topics=topics)
        take(res, f"condition:{c['key']}", c["key"], limit=2, require_topics=topics)

    # 2. evidence tied to red flags
    codes = {f["code"] for f in red_flags}
    flag_topics: list[str] = []
    if codes & {"cardiac", "chest_pain", "stroke", "neuro", "hypoxia", "breathing", "bp_crisis"}:
        flag_topics.append("emergency")
    if "stroke" in codes:
        flag_topics.append("stroke")
    if "self_harm" in codes:
        flag_topics.append("mental_health")
    for t in flag_topics:
        take(retrieval.search(db, t.replace("_", " "), k=4, topics=[t]), f"red_flag:{t}", limit=1, require_topics=[t])

    # 3. evidence relevant to the patient's own history
    seen_topics: set[str] = set()
    for item in _history_terms({"chronic_conditions": pctx.get("chronic_conditions", []), "family_history": []}):
        for term, topic in HISTORY_TOPICS.items():
            if term in item and topic not in seen_topics:
                seen_topics.add(topic)
                take(retrieval.search(db, item, k=4, topics=[topic]), f"history:{item[:40]}", limit=1, require_topics=[topic])
    if pctx.get("smoker"):
        take(retrieval.search(db, "smoking tobacco", k=4, topics=["smoking"]), "history:smoker", limit=1, require_topics=["smoking"])

    # 4. nothing topic-matched: fall back to a plain text query so the user still gets something relevant
    if not docs:
        q = " ".join([*symptom_labels[:6], *[l["test"] for l in abnormal_labs[:3]]]).strip()
        if q:
            take(retrieval.search(db, q, k=3), "symptoms", limit=3)

    sources = []
    id_by_slug: dict[str, str] = {}
    for i, (slug, d) in enumerate(docs.items(), start=1):
        sid = f"S{i}"
        id_by_slug[slug] = sid
        sources.append({
            "id": sid, "slug": slug, "title": d["title"], "source": d["source"], "url": d["url"],
            "topics": d["topics"], "origin": d["origin"], "score": d["score"],
            "snippet": d["snippet"], "excerpt": d.get("excerpt") or d["snippet"], "reasons": d["reasons"],
        })
    cond_ids = {k: [id_by_slug[s] for s in slugs if s in id_by_slug] for k, slugs in cond_slugs.items()}
    return sources, cond_ids


# --------------------------------------------------------------------------- LLM context

def build_context(*, urgency: str, red_flags: list[dict], symptom_labels: list[str], conditions: list[dict],
                  labs: list[dict], pctx: dict, sources: list[dict], cond_evidence: dict[str, list[str]],
                  abnormal_labs: list[dict], trends: list[dict] | None = None) -> dict:
    return {
        "urgency": urgency,  # fixed by safety rules; the model may not change it
        "red_flags": [f["title"] for f in red_flags],
        "symptoms": symptom_labels,
        "conditions": [
            {
                "key": c["key"], "name": c["name"], "match_score": c["match_score"], "confidence": c["confidence"],
                "supporting": [f["label"] for f in c["factors"] if f["direction"] == "supports"][:6],
                "against": [f["label"] for f in c["factors"] if f["direction"] == "against"][:4],
                "not_reported": c.get("not_reported", []),
                "already_in_patient_history": known_in_history(c["key"], pctx),
                "evidence_ids": cond_evidence.get(c["key"], []),
            }
            for c in conditions
        ],
        "labs": [{k: l.get(k) for k in ("test", "value", "unit", "ref_low", "ref_high", "status")} for l in labs[:30]],
        "abnormal_lab_count": len(abnormal_labs),
        # Changes over time from the patient's earlier reports (rule-based, already computed).
        "lab_trends": [
            {"test": t["name"], "assessment": t["assessment"], "summary": t["summary"], "flags": [f["text"] for f in t["flags"]]}
            for t in (trends or [])[:10]
        ],
        "patient": {
            "age": pctx.get("age"), "sex": pctx.get("sex"), "is_pregnant": pctx.get("is_pregnant"),
            "chronic_conditions": pctx.get("chronic_conditions", []),
            "current_medications": pctx.get("current_medications", []),
            "allergies": pctx.get("allergies", []),
            "family_history": [f.strip() for f in pctx.get("family_history", [])],
            "smoker": pctx.get("smoker"),
        },
        "sources": [{"id": s["id"], "title": s["title"], "organisation": s["source"], "excerpt": s["excerpt"]} for s in sources],
    }


# --------------------------------------------------------------------------- AI output handling

_CITE = re.compile(r"\[\s*(S\d+)\s*\]", re.I)
_HEDGE = re.compile(r"\b(may|might|could|possible|possibly|consistent with|suggest|can be|discuss|whether|if you|history of|you reported|you told|your profile|rule out)\b", re.I)
@lru_cache
def _condition_aliases() -> tuple[str, ...]:
    out: set[str] = set()
    generic = {"fever", "disease", "function", "reduced", "infection", "deficiency", "dysfunction", "inflammation", "blood",
               "lipids", "viral", "upper", "respiratory", "tract", "urinary", "needs", "testing", "possible", "primary", "headache"}
    for c in load_conditions():
        main = re.split(r"[(/]", c["name"])[0].strip().lower()
        out.add(main)
        out.add(c["key"].replace("_", " "))
        for w in re.findall(r"[a-z0-9]{5,}", main):
            if w not in generic:
                out.add(w)
    return tuple(sorted((a for a in out if len(a) >= 4), key=len, reverse=True))


@lru_cache
def _assertion_patterns() -> tuple[re.Pattern, re.Pattern]:
    alt = "|".join(re.escape(a) for a in _condition_aliases())
    pron = re.compile(
        rf"\byou(?:'ve| have| had| got| are having| are suffering from| suffer from| were diagnosed with| are diagnosed with)\s+"
        rf"(?:a |an |the )?(?:\w+ ){{0,2}}(?:{alt})\b", re.I)
    it = re.compile(
        rf"\b(?:this|it|that)(?: is|'s| was)(?: definitely| certainly| clearly| probably| likely)?(?: a| an)?(?: case of)? (?:{alt})\b", re.I)
    return pron, it


def drop_condition_assertions(text: str) -> tuple[str, list[str]]:
    """Remove sentences that state, without hedging, that the patient has a named condition."""
    if not text:
        return text, []
    pron, it = _assertion_patterns()
    kept, removed = [], []
    for sent in re.split(r"(?<=[.!?])\s+", text):
        if (pron.search(sent) or it.search(sent)) and not _HEDGE.search(sent):
            removed.append(sent.strip())
        else:
            kept.append(sent)
    return " ".join(kept).strip(), removed


def validate_ai_response(resp: LLMResponse) -> None:
    """Reject replies that are not usable (so the next provider is tried)."""
    if resp.is_mock:
        return
    data = resp.data
    if not isinstance(data, dict):
        raise ProviderError("response was not a JSON object", kind="invalid_response")
    summary = data.get("summary")
    if not isinstance(summary, str) or len(summary.strip()) < 20:
        raise ProviderError("response had no usable 'summary'", kind="invalid_response")
    notes = data.get("condition_notes", [])
    if notes is not None and not isinstance(notes, list):
        raise ProviderError("'condition_notes' must be a list", kind="invalid_response")


def clean_ai_output(data: dict, *, conditions: list[dict], source_ids: set[str], urgency: str) -> tuple[dict, int]:
    """Sanitise the model output. Returns (explanation dict, number of removed sentences)."""
    removed: list[str] = []

    def clean(value) -> str:
        t = str(value or "").strip()
        t = _CITE.sub(lambda m: m.group(0) if m.group(1).upper() in source_ids else "", t)
        t, r1 = sanitize_text(t)
        t, r2 = drop_condition_assertions(t)
        removed.extend(r1 + r2)
        return re.sub(r"\s{2,}", " ", t).strip()

    allowed = {c["key"] for c in conditions}
    notes = []
    for n in data.get("condition_notes") or []:
        if not isinstance(n, dict):
            continue
        key = n.get("key") or n.get("condition_key")
        if key not in allowed:  # the model may not introduce conditions
            continue
        text = clean(n.get("explanation"))
        if not text:
            continue
        cites: list[str] = []
        for c in n.get("cites") or []:
            cid = str(c).strip().strip("[]").upper()
            if cid in source_ids and cid not in cites:
                cites.append(cid)
        notes.append({"key": key, "explanation": text, "cites": cites, "grounded": bool(cites)})

    summary = clean(data.get("summary"))
    guidance = URGENCY_GUIDANCE[urgency]
    if urgency in ("emergency", "urgent") and not summary.startswith(guidance):
        summary = f"{guidance} {summary}".strip()  # safety rules always speak first

    explanation = {
        "summary": summary,
        "report_interpretation": clean(data.get("report_interpretation")),
        "condition_notes": notes,
        "uncertainty": [t for t in (clean(u) for u in (data.get("uncertainty") or [])[:5]) if t],
        "questions_for_doctor": [t for t in (clean(q) for q in (data.get("questions_for_doctor") or [])[:6]) if t],
        "notice": None,
    }
    return explanation, len(removed)


def rules_explanation(urgency: str, red_flags: list[dict], abnormal_labs: list[dict], lab_count: int, notice: str) -> dict:
    """Deterministic text used when the language model is not used (emergency) or unavailable."""
    parts = [URGENCY_GUIDANCE[urgency]]
    if red_flags:
        parts.append("Warning signs: " + "; ".join(f["title"] for f in red_flags[:4]) + ".")
    if abnormal_labs:
        lab_txt = "; ".join(f"{l['test']} {l['value']} {l.get('unit') or ''} ({l['status'].replace('_', ' ')})".replace("  ", " ") for l in abnormal_labs[:6])
        interp = f"Values outside the typical reference range: {lab_txt}. Your doctor will interpret these alongside your history."
    elif lab_count:
        interp = "All recognised lab values were within typical reference ranges."
    else:
        interp = ""
    return {
        "summary": " ".join(parts), "report_interpretation": interp, "condition_notes": [], "uncertainty": [],
        "questions_for_doctor": ["Which warning signs should make me seek care sooner?", "Which tests do I need to confirm or rule out the possibilities?",
                                 "How do my existing conditions and medicines affect this?"],
        "notice": notice,
    }


# --------------------------------------------------------------------------- AI status block

def failure_message(attempts: list[dict], reason: str | None = None) -> str:
    fails = [a for a in attempts if a.get("ok") is False]
    if fails:
        return "; ".join(f"{a['provider']}: {KIND_MESSAGES.get(a.get('kind', 'error'), KIND_MESSAGES['error'])}" for a in fails)
    return KIND_MESSAGES.get(reason or "error", KIND_MESSAGES["error"])


def ai_block(*, status: str, provider: str, model: str, reason: str | None, message: str | None, attempts: list[dict]) -> dict:
    """status: generated | mock | failed | skipped_emergency. ``is_real_ai`` is true only for generated."""
    return {
        "status": status, "is_real_ai": status == "generated", "provider": provider, "model": model,
        "reason": reason, "message": message, "attempts": attempts,
    }


# --------------------------------------------------------------------------- structured assessment

def _condition_uncertainty(c: dict, ranked: list[dict], known: bool) -> list[str]:
    out = ["This is a screening match, not a confirmed diagnosis."]
    if c["confidence"] == "low":
        out.append("The evidence supporting this possibility is weak.")
    cov = (c.get("score_components") or {}).get("coverage")
    if cov is not None and cov < 0.5:
        out.append(f"Fewer than half of its typical features were present ({round(cov * 100)}% coverage).")
    cond = condition_by_key(c["key"]) or {}
    has_lab = any(f["type"] == "lab" and f["points"] > 0 for f in c["factors"])
    if cond.get("requires_lab_confirmation") and not has_lab:
        out.append("It can only be assessed properly with blood tests, and no matching lab result was available.")
    idx = ranked.index(c)
    if idx + 1 < len(ranked) and abs(c["match_score"] - ranked[idx + 1]["match_score"]) < 0.08:
        out.append(f"Its score is very close to {ranked[idx + 1]['name']}; the available information cannot separate them.")
    if known:
        out.append("You already listed this condition in your history, so this may reflect your existing condition rather than a new problem.")
    return out


def build_assessment(*, urgency: str, red_flags: list[dict], conditions: list[dict], pctx: dict, sources: list[dict],
                     cond_evidence: dict[str, list[str]], explanation: dict, ai: dict, care_plan: dict,
                     limitations: list[str], data_completeness: dict, abnormal_lab_count: int) -> dict:
    notes = {n["key"]: n for n in explanation.get("condition_notes", [])}
    src_by_id = {s["id"]: s for s in sources}
    possible = []
    for c in conditions:
        known = known_in_history(c["key"], pctx)
        history = [f["label"] for f in c["factors"] if f["type"] == "risk_factor" and ("History" in f["label"] or "history" in f["label"])]
        history += [f"Existing condition in your history: {h}" for h in matching_history(c["key"], pctx)]
        ev_ids = cond_evidence.get(c["key"], [])
        note = notes.get(c["key"])
        possible.append({
            "key": c["key"], "name": c["name"], "category": c["category"],
            "status": "unconfirmed", "is_diagnosis": False,
            "confidence": c["confidence"], "match_score": c["match_score"],
            "supporting": [{"type": f["type"], "label": f["label"], "points": f["points"]} for f in c["factors"] if f["direction"] == "supports"][:8],
            "against": [{"type": f["type"], "label": f["label"], "points": f["points"]} for f in c["factors"] if f["direction"] == "against"][:5],
            "not_reported": c.get("not_reported", []),
            "history_considered": history, "already_in_history": known,
            "evidence_ids": ev_ids,
            "evidence_note": None if ev_ids else "No matching WHO/CDC summary for this condition is in the knowledge base.",
            "uncertainty": _condition_uncertainty(c, conditions, known),
            "ai_explanation": note["explanation"] if note else None,
            "ai_cites": note["cites"] if note else [],
            "ai_grounded": bool(note and note["grounded"]),
            "suggested_tests": c.get("suggested_tests", []), "specialist": c.get("specialist"),
        })

    overall: list[dict] = []
    if not conditions:
        overall.append({"text": "No condition in the knowledge base matched strongly; this does not rule anything out.", "source": "rules"})
    if not data_completeness.get("lab_values"):
        overall.append({"text": "No lab values were available, so lab-defined conditions cannot be assessed.", "source": "rules"})
    if not data_completeness.get("profile"):
        overall.append({"text": "Age or sex is missing from your profile, which limits personalisation and reference ranges.", "source": "rules"})
    overall.append({"text": "Condition scores come from hand-set rules that have not been clinically validated; they are not probabilities.", "source": "rules"})
    overall += [{"text": t, "source": "ai"} for t in explanation.get("uncertainty", [])]

    return {
        "diagnosis_status": "screening_only_not_a_diagnosis",
        "ai": ai,
        "urgency": {
            "level": urgency, "guidance": URGENCY_GUIDANCE[urgency], "set_by": "safety_rules",
            "red_flag_codes": [f["code"] for f in red_flags],
        },
        "possible_conditions": possible,
        "uncertainty": overall,
        "limitations": limitations,
        "history_considered": {
            "conditions": pctx.get("chronic_conditions", []), "medications": pctx.get("current_medications", []),
            "allergies": pctx.get("allergies", []), "family_history": [f.strip() for f in pctx.get("family_history", [])],
        },
        "next_steps": {
            "follow_up": care_plan["follow_up"], "immediate_actions": care_plan["immediate_actions"],
            "when_to_see_doctor": care_plan["when_to_see_doctor"], "suggested_tests": care_plan["suggested_tests"],
            "specialists": care_plan["specialists"], "self_care": care_plan["self_care"], "personalised": care_plan["personalised"],
        },
        "citations": [{"id": s["id"], "title": s["title"], "source": s["source"], "url": s["url"],
                       "excerpt": s["snippet"], "reasons": s["reasons"]} for s in sources],
        "abnormal_lab_count": abnormal_lab_count,
    }
