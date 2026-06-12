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
