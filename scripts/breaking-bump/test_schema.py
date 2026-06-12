"""Unit + property tests for schema — the A->B contract validator."""
from __future__ import annotations

import sys
from pathlib import Path

from hypothesis import given, strategies as st

sys.path.insert(0, str(Path(__file__).parent))

import schema  # noqa: E402


def _valid_doc() -> dict:
    return {
        "dep": "signoz", "from": "0.122.0", "to": "0.128.0",
        "sourceConfidence": "high",
        "sources": [{"url": "https://example/changelog", "type": "changelog", "fetchedOk": True}],
        "breakingChanges": [
            {"summary": "removed flag", "detail": "the --foo flag was removed",
             "sourceUrl": "https://example/changelog#foo"}
        ],
        "deprecations": [],
        "removals": [],
        "migrationSteps": [
            {"instruction": "drop --foo from values.yaml", "sourceUrl": "https://example/guide"}
        ],
    }


def test_valid_doc_passes():
    assert schema.is_valid(_valid_doc())
    assert schema.validate(_valid_doc()) == []


def test_missing_top_level_field_fails():
    doc = _valid_doc()
    del doc["sourceConfidence"]
    assert not schema.is_valid(doc)


def test_bad_confidence_enum_fails():
    doc = _valid_doc()
    doc["sourceConfidence"] = "definitely"
    assert not schema.is_valid(doc)


def test_breaking_change_without_sourceurl_is_invalid():
    doc = _valid_doc()
    del doc["breakingChanges"][0]["sourceUrl"]
    errors = schema.validate(doc)
    assert errors  # the load-bearing invariant: no claim without a source


@given(
    section=st.sampled_from(["breakingChanges", "deprecations", "removals"]),
)
def test_property_every_finding_requires_sourceurl(section):
    """For any finding list, an item missing sourceUrl makes the doc invalid."""
    doc = _valid_doc()
    doc[section] = [{"summary": "x", "detail": "y"}]  # no sourceUrl
    assert not schema.is_valid(doc)


@given(url=st.text(min_size=1).filter(lambda s: s.strip() != ""))
def test_property_migration_step_with_sourceurl_is_accepted(url):
    """Any non-empty instruction+sourceUrl migration step is structurally valid."""
    doc = _valid_doc()
    doc["migrationSteps"] = [{"instruction": "do x", "sourceUrl": url}]
    assert schema.is_valid(doc)
