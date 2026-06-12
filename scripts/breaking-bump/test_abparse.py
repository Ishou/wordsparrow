"""Unit tests for abparse — reading agent output files into the orchestration."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import abparse  # noqa: E402

_VALID_SCHEMA = {
    "dep": "signoz", "from": "0.122.0", "to": "0.128.0",
    "sourceConfidence": "high",
    "sources": [{"url": "https://x/notes", "type": "changelog", "fetchedOk": True,
                 "provenance": "registry"}],
    "breakingChanges": [
        {"summary": "removed flag", "detail": "the --foo flag was removed",
         "sourceUrl": "https://x/notes"}
    ],
    "deprecations": [], "removals": [], "migrationSteps": [],
}


def _write(tmp_path, name, obj):
    p = tmp_path / name
    p.write_text(json.dumps(obj))
    return p


def test_load_schema_valid(tmp_path):
    p = _write(tmp_path, "abschema.json", _VALID_SCHEMA)
    doc, errors = abparse.load_schema(p)
    assert errors == []
    assert doc["dep"] == "signoz"


def test_load_schema_reports_validation_errors(tmp_path):
    bad = dict(_VALID_SCHEMA)
    del bad["sources"]
    p = _write(tmp_path, "abschema.json", bad)
    _, errors = abparse.load_schema(p)
    assert errors


def test_load_schema_missing_file_is_error(tmp_path):
    _, errors = abparse.load_schema(tmp_path / "nope.json")
    assert errors


def test_zero_docs_true_when_no_sources_fetched(tmp_path):
    schema = dict(_VALID_SCHEMA)
    schema["sources"] = [{"url": "https://x", "type": "changelog", "fetchedOk": False}]
    assert abparse.zero_docs(schema) is True


def test_zero_docs_true_when_sources_empty():
    schema = dict(_VALID_SCHEMA)
    schema["sources"] = []
    assert abparse.zero_docs(schema) is True


def test_zero_docs_false_when_a_source_fetched():
    assert abparse.zero_docs(_VALID_SCHEMA) is False


def test_early_exit_true_when_a_and_b_empty():
    assert abparse.early_exit({"a": [], "b": [], "c": ["nice refactor"]}) is True


def test_early_exit_false_when_a_nonempty():
    assert abparse.early_exit({"a": ["migrate config"], "b": [], "c": []}) is False


def test_early_exit_false_when_b_nonempty():
    assert abparse.early_exit({"a": [], "b": ["update ADR-0005"], "c": []}) is False


def test_load_verdict_approved(tmp_path):
    p = _write(tmp_path, "findings.json", {"approved": True, "findings": []})
    v = abparse.load_verdict(p)
    assert v["approved"] is True


def test_load_verdict_missing_file_is_unapproved(tmp_path):
    # A crashed/absent C output must never be read as approval.
    v = abparse.load_verdict(tmp_path / "nope.json")
    assert v == {"approved": False, "findings": []}


def test_finding_keys_stable_for_hashing(tmp_path):
    v = {"approved": False, "findings": ["b: stale ADR", "a: missing flag"]}
    assert abparse.finding_keys(v) == ["a: missing flag", "b: stale ADR"]
