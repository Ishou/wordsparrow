from __future__ import annotations

import pathlib

import yaml

_WORKFLOW = (
    pathlib.Path(__file__).resolve().parents[2]
    / ".github"
    / "workflows"
    / "issue-dev-chatops.yml"
)


def _load():
    return yaml.safe_load(_WORKFLOW.read_text())


def _agent_steps(doc):
    steps = doc["jobs"]["chatops"]["steps"]
    return [s for s in steps if str(s.get("uses", "")).startswith("anthropics/claude-code-action")]


def test_chatops_workflow_is_valid_yaml():
    # guards the colon-in-plain-scalar break that silently disabled the workflow.
    assert _load()["jobs"]["chatops"]["steps"]


def test_every_agent_step_has_pat_and_issues_cli_allowlist():
    # each agent step shells to the issues CLI, needing the PAT and a Bash allowlist.
    steps = _agent_steps(_load())
    assert steps, "expected at least one claude-code-action step"
    for step in steps:
        name = step.get("name", "?")
        assert "ISSUE_PROJECT_PAT" in str(step.get("env", {}).get("GH_TOKEN", "")), name
        args = step.get("with", {}).get("claude_args", "")
        assert "--allowed-tools" in args, name
        assert "Bash(scripts/issues/issues:*)" in args, name


def test_plan_review_transition_is_deterministic_not_agent_owned():
    steps = _load()["jobs"]["chatops"]["steps"]
    movers = [s for s in steps if "plan_review" in str(s.get("run", ""))]
    assert movers, "expected a deterministic run step that sets plan_review"
