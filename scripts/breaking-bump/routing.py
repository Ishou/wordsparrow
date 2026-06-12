"""Deterministic routing for the breaking-bump dispatcher (Step 0) + AI gate."""
from __future__ import annotations

# Step 0 routes
SKIP = "skip"          # dep not on the allowlist -> no cost at all
PIPELINE = "pipeline"  # run the full A -> B -> C -> D pipeline
AI_GATE = "ai-gate"    # cheap changelog smell test

# AI-gate / no-doc routes
MERGEABLE = "mergeable"
ESCALATE = "escalate"


def parse_semver(version: str) -> tuple[int, int, int]:
    """Parse `v0.122.0` / `1.2` / `1` to (major, minor, patch); missing parts default to 0."""
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
    """Derive Renovate's updateType from two versions: 'major' | 'minor' | 'patch'."""
    f_major, f_minor, _ = parse_semver(frm)
    t_major, t_minor, _ = parse_semver(to)
    if t_major != f_major:
        return "major"
    if t_minor != f_minor:
        return "minor"
    return "patch"


def _pipeline_eligible(update_type: str, current_major: int) -> bool:
    """True for a major bump OR any bump on a 0.x dep (semver §4: anything may break)."""
    return update_type == "major" or current_major == 0


def dispatch_route(update_type: str, current_major: int, on_allowlist: bool) -> str:
    """Step 0 routing: non-allowlisted→SKIP; pipeline-eligible→PIPELINE; else AI_GATE."""
    if not on_allowlist:
        return SKIP
    return PIPELINE if _pipeline_eligible(update_type, current_major) else AI_GATE


def gate_route(verdict: str) -> str:
    """AI-gate verdict→route: 'green'→MERGEABLE; else PIPELINE (fail-safe)."""
    return MERGEABLE if verdict == "green" else PIPELINE


def nodoc_route(update_type: str, current_major: int) -> str:
    """Zero docs fetched: pipeline-eligible→ESCALATE (human review); else MERGEABLE."""
    return ESCALATE if _pipeline_eligible(update_type, current_major) else MERGEABLE
