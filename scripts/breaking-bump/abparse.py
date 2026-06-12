"""Read A/B/C agent output files into deterministic orchestration decisions."""
from __future__ import annotations

import json
from pathlib import Path

import schema as ab_schema


def _load_json(path: str | Path) -> dict | None:
    try:
        return json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError):
        return None


def load_schema(path: str | Path) -> tuple[dict, list[str]]:
    """Load A's output; return (doc, validation_errors). Missing/bad file -> error."""
    doc = _load_json(path)
    if doc is None:
        return {}, ["abschema.json missing or not valid JSON"]
    return doc, ab_schema.validate(doc)


def zero_docs(doc: dict) -> bool:
    """True iff A fetched no usable source (the deterministic zero-doc tripwire)."""
    sources = doc.get("sources") or []
    return not any(s.get("fetchedOk") for s in sources)


# Ordered confidence scale; unknown/missing strings sort lowest as "none".
_CONFIDENCE_ORDER = ["none", "low", "medium", "high"]


def _confidence_rank(level: str) -> int:
    try:
        return _CONFIDENCE_ORDER.index(level)
    except ValueError:
        return 0


def registry_confidence(doc: dict, *, breaking_eligible: bool) -> str:
    """Max confidence the contract may claim, from machine-stamped provenance + fetchedOk."""
    reg_ok = any(s.get("provenance") == "registry" and s.get("fetchedOk")
                 for s in doc.get("sources", []))
    no_breaks = not (doc.get("breakingChanges") or doc.get("removals"))
    if breaking_eligible and no_breaks and not reg_ok:
        return "low"
    return "high" if reg_ok else "medium"


def confidence_gate_failed(doc: dict, *, breaking_eligible: bool) -> bool:
    """True iff the effective confidence (min of self-rating and provenance floor) is low or lower."""
    self_reported = doc.get("sourceConfidence", "medium")
    floor = registry_confidence(doc, breaking_eligible=breaking_eligible)
    effective = min(_confidence_rank(self_reported), _confidence_rank(floor))
    return breaking_eligible and effective <= _confidence_rank("low")


def early_exit(plan: dict) -> bool:
    """True iff (a)+(b) are both empty — the 'let Renovate merge' cleared path."""
    return not (plan.get("a") or plan.get("b"))


def load_verdict(path: str | Path) -> dict:
    """Load C's verdict; missing/bad file is read as NOT approved (fail-safe)."""
    doc = _load_json(path)
    if doc is None or "approved" not in doc:
        return {"approved": False, "findings": []}
    return {"approved": bool(doc["approved"]), "findings": list(doc.get("findings") or [])}


def finding_keys(verdict: dict) -> list[str]:
    """Sorted findings list for the identical-finding terminator's stable hash."""
    return sorted(str(f) for f in (verdict.get("findings") or []))
