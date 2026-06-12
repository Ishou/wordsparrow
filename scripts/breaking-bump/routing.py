"""Deterministic routing for the breaking-bump dispatcher (Step 0) + AI gate.

Pure functions — no I/O, no LLM; the workflow YAML stays thin and calls these.
Vocabulary: semver x.y.z = major.minor.patch = Renovate `updateType` values.
"""
from __future__ import annotations

# Step 0 routes
SKIP = "skip"          # dep not on the allowlist -> no cost at all
PIPELINE = "pipeline"  # run the full A -> B -> C -> D pipeline
AI_GATE = "ai-gate"    # cheap changelog smell test

# AI-gate / no-doc routes
MERGEABLE = "mergeable"
ESCALATE = "escalate"


def parse_semver(version: str) -> tuple[int, int, int]:
    """`v0.122.0` / `1.2` / `1` -> (major, minor, patch); missing parts default to 0.
    A leading `v` and any pre-release/build suffix are stripped."""
    core = version.strip().lstrip("vV").split("-", 1)[0].split("+", 1)[0]
    parts = core.split(".")
    nums = []
    for i in range(3):
        try:
            nums.append(int(parts[i]))
        except (IndexError, ValueError):
            nums.append(0)
    return nums[0], nums[1], nums[2]


def update_type(frm: str, to: str) -> str:
    """Derive Renovate's updateType from two versions: 'major' | 'minor' | 'patch'.
    A cross-check on the Renovate label using the same vocabulary."""
    f_major, f_minor, _ = parse_semver(frm)
    t_major, t_minor, _ = parse_semver(to)
    if t_major != f_major:
        return "major"
    if t_minor != f_minor:
        return "minor"
    return "patch"


def _pipeline_eligible(update_type: str, current_major: int) -> bool:
    """Deterministic 'breaking-equivalent' predicate: a major bump, OR ANY bump on a
    0.x dep. Per semver §4, when major == 0 anything may break, so a 0.x minor *or*
    patch is treated exactly like a major."""
    return update_type == "major" or current_major == 0


def dispatch_route(update_type: str, current_major: int, on_allowlist: bool) -> str:
    """Step 0's deterministic routing. The allowlist gates EVERYTHING (incl. the AI
    gate), so a non-allowlisted dep costs zero. Otherwise: pipeline-eligible (a
    major, or any 0.x bump) -> PIPELINE; a >=1.x minor/patch -> AI_GATE."""
    if not on_allowlist:
        return SKIP
    return PIPELINE if _pipeline_eligible(update_type, current_major) else AI_GATE


def gate_route(verdict: str) -> str:
    """AI-gate verdict -> route. 'green' -> MERGEABLE; anything else
    ('breaking' / 'ambiguous') -> PIPELINE (fail-safe toward review)."""
    return MERGEABLE if verdict == "green" else PIPELINE


def nodoc_route(update_type: str, current_major: int) -> str:
    """When zero usable docs were fetched, decide by severity: a pipeline-eligible
    bump (a major, or any 0.x bump) -> ESCALATE (Gate A, a human must look); a
    >=1.x minor/patch -> MERGEABLE (semver says low-risk, CI tests are the
    backstop)."""
    return ESCALATE if _pipeline_eligible(update_type, current_major) else MERGEABLE
