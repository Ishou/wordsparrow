"""Tests for the post-D diff scope gate (ADR-0068 hardening, Wave B)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import scope_gate  # noqa: E402

_OTEL = "frontend/src/infrastructure/observability/otelTracer.ts"
_PLAN = {"a": [f"In {_OTEL}, update the OTLPTraceExporter url."], "b": [], "c": []}


def test_sensitive_blocks_workflow_edits():
    v = scope_gate.evaluate([".github/workflows/deploy-api-k8s.yml"], _PLAN)
    assert ".github/workflows/deploy-api-k8s.yml" in v["sensitive"]
    assert not v["ok"]


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
