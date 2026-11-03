"""Rule-based choice of the type of doctor to consult.

The mapping lives in ``app/data/specialties.json``; the AI never chooses or invents a
specialty. Inputs are the deterministic screening results (condition matches, urgency) and
the patient's lab trends. Every suggestion carries the reasons that triggered it.

A general physician is always the first-line suggestion (except in an emergency, where the
emergency department comes first). Specialists are listed as "may be appropriate", usually
after a general physician has reviewed the results.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "specialties.json"

NOTE = ("Suggested doctor types come from fixed, hand-written rules based on your results. They are not a referral "
        "and are not clinically validated; a general physician can advise which specialist, if any, you need.")

TREND_WHEN = "to review this change over time, usually after a general physician has seen your results"
TRIGGER_ASSESSMENTS = ("worsening", "approaching_limit")


@lru_cache
def _data() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def version() -> str:
    return _data()["version"]


@lru_cache
def specialties() -> dict[str, dict]:
    return {s["code"]: s for s in _data()["specialties"]}


def condition_mapping(key: str) -> dict:
    return _data()["conditions"].get(key, {"specialists": [], "when": None})


def specialties_for_condition(key: str) -> list[str]:
    """Specialty codes for a condition, first-line (general physician) first."""
    return ["general_physician"] + [c for c in condition_mapping(key)["specialists"] if c != "general_physician"]


def label_for_condition(key: str) -> str:
    """Short human label, e.g. 'General physician / endocrinologist'."""
    sp = specialties()
    names = [sp[c]["doctor"] for c in specialties_for_condition(key)]
    return " / ".join([names[0]] + [n[0].lower() + n[1:] for n in names[1:]])


def specialty_for_test(code: str, category: str | None) -> str | None:
    d = _data()
    return d["lab_tests"].get(code) or d["lab_categories"].get(category or "")


def _trend_needs_review(t: dict) -> bool:
    if t.get("n", 0) < 2:
        return False
    if t.get("assessment") in TRIGGER_ASSESSMENTS:
        return True
    persistent = any(f.get("kind") == "persistent" for f in t.get("flags", []))
    return persistent and t.get("latest", {}).get("status") not in (None, "normal")


def recommend(conditions: list[dict], urgency: str, trends: list[dict] | None = None) -> dict:
    """Doctor types to consider, with the reasons for each.

    ``conditions`` are scored matches (key, name, confidence); ``trends`` are lab trends as
    returned by ``services.trends.compute_trends``.
    """
    sp = specialties()
    items: dict[str, dict] = {}

    def add(code: str, role: str, source: str, text: str, when: str | None = None) -> None:
        if code not in sp:
            return
        item = items.get(code)
        if item is None:
            s = sp[code]
            item = items[code] = {"code": code, "name": s["name"], "doctor": s["doctor"], "what": s["what"],
                                  "role": role, "reasons": [], "when": when}
        if text not in [r["text"] for r in item["reasons"]]:
            item["reasons"].append({"source": source, "text": text})
        if when and not item["when"]:
            item["when"] = when

    if urgency == "emergency":
        add("emergency", "emergency", "safety", "Emergency warning signs were detected in what you entered.")

    for i, c in enumerate(conditions[:3]):
        if c.get("confidence") == "low" and i > 0:
            continue
        reason = f"Possible {c['name']} ({c.get('confidence', 'low')} match)"
        mapping = condition_mapping(c["key"])
        add("general_physician", "first_line", "condition", reason)
        for code in mapping["specialists"]:
            add(code, "specialist", "condition", reason, mapping.get("when"))

    for t in trends or []:
        if not _trend_needs_review(t):
            continue
        reason = t.get("summary") or f"{t.get('name')} has changed across your reports"
        add("general_physician", "first_line", "trend", reason)
        code = specialty_for_test(t.get("code", ""), t.get("category"))
        if code and code != "general_physician":
            add(code, "specialist", "trend", reason, TREND_WHEN)

    order = {"emergency": 0, "first_line": 1, "specialist": 2}
    # dicts keep insertion order: the strongest condition match (then trends) comes first within each role
    ranked = sorted(items.values(), key=lambda x: order[x["role"]])
    return {"version": version(), "items": ranked, "note": NOTE}
