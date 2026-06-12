"""Validate Agent A's output against the A→B contract schema."""
from __future__ import annotations

import json
from pathlib import Path

import jsonschema

_SCHEMA_PATH = Path(__file__).parent / "schema" / "ab_contract.schema.json"
_VALIDATOR = jsonschema.Draft202012Validator(json.loads(_SCHEMA_PATH.read_text()))


def validate(doc: dict) -> list[str]:
    """Return a list of human-readable validation errors (empty list = valid)."""
    return [
        f"{'/'.join(str(p) for p in err.path) or '<root>'}: {err.message}"
        for err in _VALIDATOR.iter_errors(doc)
    ]


def is_valid(doc: dict) -> bool:
    """True iff the doc satisfies the A->B contract."""
    return not validate(doc)
