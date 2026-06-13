"""Regression gates for the breaking-bump prompt-injection structural guards (ADR-0068)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import identity  # noqa: E402
import schema as ab_schema  # noqa: E402

_PROMPTS_DIR = Path(__file__).parents[2] / ".github" / "breaking-bump" / "prompts"
_AGENT_PROMPTS = ["ai-gate.md", "agent-a.md", "agent-b.md", "agent-c.md", "agent-d.md"]


def _valid_contract(**overrides) -> dict:
    """A minimal schema-valid A->B contract; override fields per test."""
    doc = {
        "dep": "signoz", "from": "0.122.0", "to": "0.123.0",
        "sourceConfidence": "high",
        "sources": [{"url": "https://example.com", "type": "release",
                     "fetchedOk": True, "provenance": "pr-body"}],
        "breakingChanges": [], "deprecations": [], "removals": [],
        "migrationSteps": [],
    }
    doc.update(overrides)
    return doc


# Invariant 1: every agent prompt must mark ingested content untrusted and forbid obeying embedded instructions.
def test_every_agent_prompt_declares_external_content_untrusted():
    untrusted = re.compile(r"untrusted|prompt[- ]inject|adversari|treat .*as data",
                           re.IGNORECASE)
    do_not_obey = re.compile(
        r"do not (?:follow|obey|execute|act on)|never (?:follow|obey|execute)|"
        r"ignore (?:any |embedded )?instructions", re.IGNORECASE)
    missing = []
    for name in _AGENT_PROMPTS:
        text = (_PROMPTS_DIR / name).read_text()
        if not (untrusted.search(text) and do_not_obey.search(text)):
            missing.append(name)
    assert not missing, (
        "Prompts with no injection-defense clause (untrusted-content warning + "
        f"explicit do-not-obey-embedded-instructions): {missing}")


# Invariant 2: the A->B contract must bound attacker-controlled free-text field lengths.
def test_ab_contract_bounds_breaking_change_detail_length():
    huge = "A" * 10_000
    doc = _valid_contract(breakingChanges=[
        {"summary": "x", "detail": huge, "sourceUrl": "https://example.com"}])
    errors = ab_schema.validate(doc)
    assert errors, "schema accepted a 10k-char `detail` — no maxLength bound on the verbatim-quote field"


def test_ab_contract_bounds_migration_step_instruction_length():
    huge = "B" * 10_000
    doc = _valid_contract(migrationSteps=[
        {"instruction": huge, "sourceUrl": "https://example.com"}])
    errors = ab_schema.validate(doc)
    assert errors, "schema accepted a 10k-char `instruction` — no maxLength bound"


# Invariant 3: the Agent-D branch name must sanitise `to` (free text from the PR body) to a safe git ref.
_SAFE_REF = re.compile(r"^chore/claude-[a-z0-9._-]+-v[a-zA-Z0-9._-]+$")


def test_claude_branch_sanitizes_hostile_to_version():
    hostile = ["../../evil", "1.0.0 --upstream", "0.0.0`whoami`", "a/b/c"]
    leaks = [v for v in hostile if not _SAFE_REF.match(identity.claude_branch("signoz", v))]
    assert not leaks, f"claude_branch left these `to` values unsanitised: " + \
        ", ".join(repr(identity.claude_branch('signoz', v)) for v in leaks)
