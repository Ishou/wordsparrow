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


# The 2026-06-12 miss: clean verdict on a breaking-eligible bump backed only by
# constructed/404 sources, with no cleanly-fetched registry source.
_CLEAN_NO_REGISTRY = {
    "dep": "signoz", "from": "0.122.0", "to": "0.128.0",
    "sourceConfidence": "high",
    "sources": [{"url": "https://x/guess", "type": "changelog", "fetchedOk": True,
                 "provenance": "constructed"},
                {"url": "https://x/404", "type": "changelog", "fetchedOk": False,
                 "provenance": "websearch"}],
    "breakingChanges": [], "deprecations": [], "removals": [], "migrationSteps": [],
}


def test_regression_2026_06_12_clean_no_registry_source():
    # zero_docs is False here (a source fetchedOk) — the PRE-FIX gate let the miss through.
    assert abparse.zero_docs(_CLEAN_NO_REGISTRY) is False
    # The NEW gate catches it: clean verdict on a breaking-eligible bump, no clean registry source.
    assert abparse.confidence_gate_failed(_CLEAN_NO_REGISTRY, breaking_eligible=True) is True


def test_confidence_gate_passes_with_clean_registry_source():
    doc = dict(_CLEAN_NO_REGISTRY)
    doc["sources"] = [{"url": "https://x/notes", "type": "changelog", "fetchedOk": True,
                       "provenance": "registry"}]
    assert abparse.confidence_gate_failed(doc, breaking_eligible=True) is False


def test_confidence_gate_passes_when_breaks_reported():
    doc = dict(_CLEAN_NO_REGISTRY)
    doc["breakingChanges"] = [{"summary": "removed flag", "detail": "the --foo flag was removed",
                               "sourceUrl": "https://x/guess"}]
    assert abparse.confidence_gate_failed(doc, breaking_eligible=True) is False


def test_confidence_gate_passes_when_not_breaking_eligible():
    assert abparse.confidence_gate_failed(_CLEAN_NO_REGISTRY, breaking_eligible=False) is False


def test_registry_confidence_three_levels():
    reg_doc = dict(_CLEAN_NO_REGISTRY)
    reg_doc["sources"] = [{"url": "https://x/notes", "type": "changelog", "fetchedOk": True,
                           "provenance": "registry"}]
    assert abparse.registry_confidence(reg_doc, breaking_eligible=True) == "high"
    assert abparse.registry_confidence(_CLEAN_NO_REGISTRY, breaking_eligible=True) == "low"
    assert abparse.registry_confidence(_CLEAN_NO_REGISTRY, breaking_eligible=False) == "medium"


def test_confidence_gate_takes_min_self_high_floor_low():
    # self=high but floor=low → effective low → fails.
    assert abparse.confidence_gate_failed(_CLEAN_NO_REGISTRY, breaking_eligible=True) is True


def test_confidence_gate_takes_min_self_low_floor_high():
    # self=low but floor=high → effective low → fails on a breaking-eligible bump.
    doc = dict(_CLEAN_NO_REGISTRY)
    doc["sourceConfidence"] = "low"
    doc["sources"] = [{"url": "https://x/notes", "type": "changelog", "fetchedOk": True,
                       "provenance": "registry"}]
    assert abparse.confidence_gate_failed(doc, breaking_eligible=True) is True


def test_registry_confidence_tolerates_sources_missing_keys():
    doc = dict(_CLEAN_NO_REGISTRY)
    doc["sources"] = [{}, {"provenance": "registry"}, {"fetchedOk": True}]
    assert abparse.registry_confidence(doc, breaking_eligible=True) == "low"


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
