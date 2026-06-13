"""Tests for the post-D diff scope gate (ADR-0068 hardening, Wave B + plan-contract W2)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import scope_gate  # noqa: E402

_OTEL = "frontend/src/infrastructure/observability/otelTracer.ts"
_PLAN = {"a": [f"In {_OTEL}, update the OTLPTraceExporter url."], "b": [], "c": []}
_WORKFLOW = ".github/workflows/deploy-api-k8s.yml"


def _manifest(*paths: str) -> dict:
    return {"scope": {"files": [{"path": p, "change": "edit"} for p in paths]}}


def test_sensitive_blocks_secrets_and_env():
    v = scope_gate.evaluate([".env.prod", "docs/secrets.md", "infra/foo/secret-key.yaml"], _PLAN)
    assert set(v["sensitive"]) == {".env.prod", "docs/secrets.md", "infra/foo/secret-key.yaml"}
    assert not v["ok"]


def test_file_named_in_plan_is_in_scope():
    v = scope_gate.evaluate([_OTEL], _PLAN)
    assert v["out_of_scope"] == []
    assert v["sensitive"] == []
    assert v["ok"]


def test_file_not_in_plan_is_flagged():
    v = scope_gate.evaluate(["grid/api/src/main/kotlin/com/bliss/grid/api/Module.kt"], _PLAN)
    assert "grid/api/src/main/kotlin/com/bliss/grid/api/Module.kt" in v["out_of_scope"]
    assert not v["ok"]


def test_empty_plan_flags_any_change():
    v = scope_gate.evaluate(["frontend/src/whatever.ts"], {"a": [], "b": [], "c": []})
    assert v["out_of_scope"] == ["frontend/src/whatever.ts"]
    assert not v["ok"]


def test_basename_reference_counts_as_in_scope():
    # The plan may name a file by basename + line ("otelTracer.ts:219"); that still scopes it.
    plan = {"a": ["edit otelTracer.ts:219 — the exporter url"], "b": [], "c": []}
    v = scope_gate.evaluate([_OTEL], plan)
    assert v["ok"]


def test_full_path_token_does_not_match_same_basename_elsewhere():
    # Full-path plan token: same-basename file in a different directory must still fail.
    v = scope_gate.evaluate(["scripts/breaking-bump/otelTracer.ts"], _PLAN)
    assert "scripts/breaking-bump/otelTracer.ts" in v["out_of_scope"]
    assert not v["ok"]


def test_partial_path_suffix_of_plan_token_is_not_in_scope():
    # A changed path that is a proper suffix of a plan token must not pass the gate.
    v = scope_gate.evaluate(["src/infrastructure/observability/otelTracer.ts"], _PLAN)
    assert "src/infrastructure/observability/otelTracer.ts" in v["out_of_scope"]
    assert not v["ok"]


def test_clean_in_scope_change_passes():
    v = scope_gate.evaluate([_OTEL], _PLAN)
    assert v == {"sensitive": [], "out_of_scope": [], "ok": True}


# --- W2: authoritative scope.files manifest ---


def test_manifest_path_in_scope_passes():
    plan = _manifest("docs/local-development.md")
    v = scope_gate.evaluate(["docs/local-development.md"], plan)
    assert v == {"sensitive": [], "out_of_scope": [], "ok": True}


def test_manifest_path_not_in_scope_fails():
    plan = _manifest("docs/local-development.md")
    v = scope_gate.evaluate(["docs/other.md"], plan)
    assert "docs/other.md" in v["out_of_scope"]
    assert not v["ok"]


def test_manifest_secret_path_blocked_even_if_in_scope():
    plan = _manifest(".env", "infra/secrets.yaml")
    v = scope_gate.evaluate([".env", "infra/secrets.yaml"], plan)
    assert set(v["sensitive"]) == {".env", "infra/secrets.yaml"}
    assert not v["ok"]


def test_manifest_workflow_in_scope_passes():
    # Key behavior change: a declared in-scope workflow edit is allowed.
    plan = _manifest(_WORKFLOW)
    v = scope_gate.evaluate([_WORKFLOW], plan)
    assert v["sensitive"] == []
    assert v["out_of_scope"] == []
    assert v["ok"]


def test_manifest_workflow_not_in_scope_fails():
    # Off-plan workflow touch is blocked as out-of-scope (not as sensitive).
    plan = _manifest("docs/local-development.md")
    v = scope_gate.evaluate([_WORKFLOW], plan)
    assert _WORKFLOW in v["out_of_scope"]
    assert _WORKFLOW not in v["sensitive"]
    assert not v["ok"]


def test_workflow_not_blanket_sensitive_without_manifest():
    # No manifest: prose-grep fallback governs; an unreferenced workflow is out-of-scope, not sensitive.
    v = scope_gate.evaluate([_WORKFLOW], _PLAN)
    assert _WORKFLOW not in v["sensitive"]
    assert _WORKFLOW in v["out_of_scope"]
    assert not v["ok"]


def test_manifest_absent_falls_back_to_prose_grep():
    # An old-style plan with no scope.files still works via the (a)/(b) prose grep.
    v = scope_gate.evaluate([_OTEL], _PLAN)
    assert v["ok"]


def test_empty_manifest_falls_back_to_prose_grep():
    plan = {"a": [f"In {_OTEL}, update url."], "b": [], "scope": {"files": []}}
    v = scope_gate.evaluate([_OTEL], plan)
    assert v["ok"]
