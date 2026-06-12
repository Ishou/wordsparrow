# Breaking-bump Pipeline — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land ADR-0068 and the deterministic `scripts/breaking-bump/` Python core (routing, identity/slug, A→B schema validation, issue context-block + dedup) — the tested bedrock every later workflow calls.

**Architecture:** All deterministic decisions live in pure, unit-tested Python functions (no I/O, no LLM); workflow YAML (later plans) stays thin and shells out to these. Mirrors the existing `scripts/helm-enrich/` package and its `helm-enrich-tests.yml` CI. ADR-0068 merges first (ADR-0001 §7) and registers the new paths in `docs/adr/INDEX.md`.

**Tech Stack:** Python 3.14 + pytest + jsonschema + hypothesis (property-based); GitHub Actions for the test CI; Markdown for the ADR.

**Source spec:** `docs/superpowers/specs/2026-06-11-renovate-bump-supervisor-design.md` (all 13 open questions resolved). This plan implements the spec's `scripts/breaking-bump/` (#12), the routing of #1/#7, identity/dedup of #6/#11, and the A→B schema of #3.

**Scope boundary:** This plan is pure-logic + ADR only. No workflow YAML, no Renovate config, no labels, no agent prompts — those are Plans 2–4. Subprocess calls to `gh`/`git` are deliberately NOT here; the modules return *decisions/strings* that the (later) workflow shell executes.

---

## File Structure

| File | Responsibility |
|---|---|
| `docs/adr/0068-ai-driven-breaking-bump-migration-pipeline.md` | The governing ADR (Context/Decision/Consequences); supersedes 0067. |
| `docs/adr/INDEX.md` | Add path→ADR rows for the new tree (modify). Update 0067 status note. |
| `docs/adr/0067-internal-tool-upgrade-enrichment.md` | Set Status → "Superseded by ADR-0068" (modify, one line). |
| `scripts/breaking-bump/requirements.txt` | Test/runtime deps: pyyaml, pytest, jsonschema, hypothesis. |
| `scripts/breaking-bump/routing.py` | Pure routing: semver→updateType, Step 0 dispatch route, AI-gate verdict route, no-doc severity. |
| `scripts/breaking-bump/identity.py` | Dedup identity `<dep>@<from>→<to>`, ASCII slug, claude branch name. |
| `scripts/breaking-bump/schema/ab_contract.schema.json` | The A→B JSON Schema contract (draft 2020-12). |
| `scripts/breaking-bump/schema.py` | Validate a doc against the schema; expose error list. |
| `scripts/breaking-bump/issue.py` | Render/parse the spine-issue context block; find-existing dedup. |
| `scripts/breaking-bump/test_routing.py` | Tests for routing.py. |
| `scripts/breaking-bump/test_identity.py` | Tests for identity.py. |
| `scripts/breaking-bump/test_schema.py` | Tests for schema.py (incl. property-based sourceUrl invariant). |
| `scripts/breaking-bump/test_issue.py` | Tests for issue.py. |
| `.github/workflows/breaking-bump-tests.yml` | Run `pytest` on `scripts/breaking-bump/**` (mirrors helm-enrich-tests.yml). |

Module style mirrors `scripts/helm-enrich/`: `from __future__ import annotations`, module + one-line function docstrings, type hints, tests import the module via `sys.path.insert(0, str(Path(__file__).parent))`.

---

### Task 1: ADR-0068 (merges first, own PR)

**Files:**
- Create: `docs/adr/0068-ai-driven-breaking-bump-migration-pipeline.md`
- Modify: `docs/adr/INDEX.md` (add rows under `## Registry`)
- Modify: `docs/adr/0067-internal-tool-upgrade-enrichment.md` (Status line)

> No TDD here — this is a governance doc that must merge before any code it governs (ADR-0001 §7). The `registry-coherence` CI gate fails a PR that adds `docs/adr/NNNN-*.md` without updating `INDEX.md`, so both edits ship together.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0068-ai-driven-breaking-bump-migration-pipeline.md`:

```markdown
# ADR-0068: AI-driven breaking-bump migration pipeline

## Status
Accepted — supersedes ADR-0067 (internal-tool upgrade-PR enrichment)

## Context
Renovate opens dependency-bump PRs. For bumps that need migration work (a major,
or a 0.x-minor), two things break: (1) the §6a review/fix cycle pushes fixes onto
Renovate's branch, which Renovate then marks "Edited/Blocked" — deadlock; (2) a
version bump and its migration are one logical change but must not live on a
Renovate-owned branch. ADR-0067 built a helm-only enrichment pipeline
(`helm-bump-enrich.yml`) that fetches release notes and posts migration context.
We now generalise that into a full, ecosystem-agnostic pipeline.

Full design: `docs/superpowers/specs/2026-06-11-renovate-bump-supervisor-design.md`
(13 resolved open questions).

## Decision
A fully CI-native pipeline, **`breaking-bump`**, triggered from Renovate PRs:

- **Step 0 (deterministic, no AI)** routes each `renovate/*` PR: not-allowlisted →
  skip; `major` or `0.x-minor` → pipeline; other `minor`/`patch` → a cheap AI
  "smell test". An allowlist (signoz only, at first) gates the whole dispatcher.
- **The pipeline is a single GH issue-triggered workflow run** (the issue is the
  durable "spine"), with agents as `needs:`-chained `claude-code-action` jobs:
  **A** (doc gatherer, never reads code) → **B** (planner) ⇄ **C** (plan reviewer,
  bounded 6-round loop) → **D** (implementer: forks `claude/<dep>-v<to>`, then
  closes the Renovate PR, opens a claude PR that hits the existing §6a cycle).
- **Ascending ratings** (B rates A, C rates B, §6a rates D); failures funnel to the
  spine issue (`needs-human`). The human merge of the claude PR is the safety net.
- **§6a is suppressed on `renovate/*`** (the clobber fix); it runs on the claude PR.
- Agent A **absorbs** `helm-bump-enrich` (ADR-0067) as a special case; the helm
  values-diff survives as a helm-only extra.

Naming/layout: scripts under `scripts/breaking-bump/`, workflows
`breaking-bump-{dispatch,,tests}.yml`, prompts `.github/breaking-bump/prompts/`,
five labels (`ai-driven`, `breaking-bump`, `post-bump-enhancement`, `needs-human`,
`ai-cleared`). Rollout is incremental, one dep at a time (signoz first).

## Consequences
- **Easier:** non-trivial dependency upgrades get grounded, reviewed migration
  attempts as ready-to-review PRs; the §6a/Renovate clobber is eliminated.
- **Harder / new surface:** more CI machinery and a multi-agent run per impacted
  bump; a token-cost surface bounded by the allowlist + per-bump caps.
- **Migration:** ADR-0067's helm-enrich pipeline is re-homed under Agent A, not
  deleted day one; `infra/tools-upgrade-sources.yaml` is kept (verified entries).
- This is a lab artifact intended to be reusable in other repos.
```

- [ ] **Step 2: Register the new paths in INDEX.md**

In `docs/adr/INDEX.md`, under the ` ``` ` block in `## Registry`, add these rows (align the glob column with the existing entries):

```
ADR-0068  scripts/breaking-bump/**                   Deterministic core of the breaking-bump pipeline (routing, schema, identity)
ADR-0068  .github/workflows/breaking-bump-*.yml      Breaking-bump dispatcher + pipeline + tests workflows
ADR-0068  .github/breaking-bump/prompts/**           Per-agent prompts (A/B/C/D + ai-gate); versioned, not inline in YAML
ADR-0067  infra/tools-upgrade-sources.yaml           Source registry; reactive override, keep verified entries (now ADR-0068)
```

- [ ] **Step 3: Mark ADR-0067 superseded**

Read `docs/adr/0067-internal-tool-upgrade-enrichment.md`, find its `## Status` line, and change it to:

```markdown
## Status
Superseded by ADR-0068 (generalised into the breaking-bump pipeline; helm-enrich
becomes a special case of Agent A)
```

- [ ] **Step 4: Verify the registry-coherence expectation locally**

Run: `git diff --name-only` and confirm both `docs/adr/0068-*.md` and `docs/adr/INDEX.md` are staged together.
Expected: both paths listed (the gate fails if the ADR changes without INDEX.md).

Optionally run the helper to confirm the new globs resolve:
Run: `scripts/adr-context.sh scripts/breaking-bump/routing.py`
Expected: prints the ADR-0068 body (proves the glob matches).

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0068-ai-driven-breaking-bump-migration-pipeline.md docs/adr/INDEX.md docs/adr/0067-internal-tool-upgrade-enrichment.md
git commit -s -m "docs(adr): add ADR-0068 breaking-bump pipeline, supersede 0067"
```

---

### Task 2: Package scaffold + test CI

**Files:**
- Create: `scripts/breaking-bump/requirements.txt`
- Create: `.github/workflows/breaking-bump-tests.yml`

> No production code yet — just the dependency manifest and the CI that will run every later test. We assert the package is wired by having pytest succeed on an empty collection guard.

- [ ] **Step 1: Write requirements.txt**

Create `scripts/breaking-bump/requirements.txt`:

```
pyyaml>=6.0
pytest>=8.0
jsonschema>=4.21
hypothesis>=6.100
```

- [ ] **Step 2: Write the test CI workflow**

Create `.github/workflows/breaking-bump-tests.yml` (mirrors `helm-enrich-tests.yml`, including the SHA-pinned checkout):

```yaml
name: breaking-bump-tests

on:
  pull_request:
    paths:
      - 'scripts/breaking-bump/**'
      - '.github/workflows/breaking-bump-tests.yml'

permissions:
  contents: read

jobs:
  pytest:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
      - uses: actions/setup-python@v5
        with:
          python-version: '3.14.6'
      - name: Install deps
        run: pip install -r scripts/breaking-bump/requirements.txt
      - name: Run tests
        run: cd scripts/breaking-bump && python -m pytest -v
```

- [ ] **Step 3: Verify pip install resolves**

Run: `pip install -r scripts/breaking-bump/requirements.txt`
Expected: installs pyyaml, pytest, jsonschema, hypothesis without error.

- [ ] **Step 4: Commit**

```bash
git add scripts/breaking-bump/requirements.txt .github/workflows/breaking-bump-tests.yml
git commit -s -m "chore(breaking-bump): scaffold scripts package + test CI"
```

---

### Task 3: routing.py — deterministic routing

**Files:**
- Create: `scripts/breaking-bump/routing.py`
- Test: `scripts/breaking-bump/test_routing.py`

Implements spec #1 (deterministic pre-filter, semver vocabulary), #7 (AI-gate verdict route + no-doc severity), #13 (allowlist gates everything).

- [ ] **Step 1: Write the failing tests**

Create `scripts/breaking-bump/test_routing.py`:

```python
"""Unit tests for routing — the deterministic dispatch/gate decisions."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import routing  # noqa: E402


def test_parse_semver_strips_prefix_and_suffix():
    assert routing.parse_semver("v0.122.0") == (0, 122, 0)
    assert routing.parse_semver("1.2.3-rc1") == (1, 2, 3)
    assert routing.parse_semver("2.10") == (2, 10, 0)
    assert routing.parse_semver("3") == (3, 0, 0)


def test_update_type_from_versions():
    assert routing.update_type("1.2.3", "2.0.0") == "major"
    assert routing.update_type("0.122.0", "0.128.0") == "minor"
    assert routing.update_type("1.2.3", "1.2.4") == "patch"


def test_dispatch_route_allowlist_gates_everything():
    # Not allowlisted -> skip even a major (zero cost, signoz-only intent).
    assert routing.dispatch_route("major", 1, on_allowlist=False) == routing.SKIP
    assert routing.dispatch_route("minor", 0, on_allowlist=False) == routing.SKIP


def test_dispatch_route_pipeline_vs_ai_gate():
    assert routing.dispatch_route("major", 1, on_allowlist=True) == routing.PIPELINE
    # 0.x-minor is breaking-equivalent -> pipeline (signoz 0.122->0.128).
    assert routing.dispatch_route("minor", 0, on_allowlist=True) == routing.PIPELINE
    # >=1.x minor/patch -> AI gate.
    assert routing.dispatch_route("minor", 1, on_allowlist=True) == routing.AI_GATE
    assert routing.dispatch_route("patch", 1, on_allowlist=True) == routing.AI_GATE
    # 0.x-patch is NOT deterministic -> AI gate.
    assert routing.dispatch_route("patch", 0, on_allowlist=True) == routing.AI_GATE


def test_gate_route():
    assert routing.gate_route("green") == routing.MERGEABLE
    assert routing.gate_route("breaking") == routing.PIPELINE
    assert routing.gate_route("ambiguous") == routing.PIPELINE


def test_nodoc_route_scales_with_pipeline_eligibility():
    # Pipeline-eligible (major, or 0.x-minor) + no doc -> escalate (Gate A).
    assert routing.nodoc_route("major", 1) == routing.ESCALATE
    assert routing.nodoc_route("minor", 0) == routing.ESCALATE
    # AI-gate minor/patch + no doc -> mergeable (semver says low-risk).
    assert routing.nodoc_route("minor", 1) == routing.MERGEABLE
    assert routing.nodoc_route("patch", 0) == routing.MERGEABLE
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/breaking-bump && python -m pytest test_routing.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'routing'`.

- [ ] **Step 3: Write routing.py**

Create `scripts/breaking-bump/routing.py`:

```python
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
    """Deterministic 'breaking-equivalent' predicate: a major, or a 0.x-minor."""
    return update_type == "major" or (current_major == 0 and update_type == "minor")


def dispatch_route(update_type: str, current_major: int, on_allowlist: bool) -> str:
    """Step 0's deterministic routing. The allowlist gates EVERYTHING (incl. the AI
    gate), so a non-allowlisted dep costs zero. Otherwise: pipeline-eligible ->
    PIPELINE; any other minor/patch -> AI_GATE."""
    if not on_allowlist:
        return SKIP
    return PIPELINE if _pipeline_eligible(update_type, current_major) else AI_GATE


def gate_route(verdict: str) -> str:
    """AI-gate verdict -> route. 'green' -> MERGEABLE; anything else
    ('breaking' / 'ambiguous') -> PIPELINE (fail-safe toward review)."""
    return MERGEABLE if verdict == "green" else PIPELINE


def nodoc_route(update_type: str, current_major: int) -> str:
    """When zero usable docs were fetched, decide by severity: a pipeline-eligible
    bump (major or 0.x-minor) -> ESCALATE (Gate A, a human must look); an AI-gate
    minor/patch -> MERGEABLE (semver says low-risk, CI tests are the backstop)."""
    return ESCALATE if _pipeline_eligible(update_type, current_major) else MERGEABLE
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/breaking-bump && python -m pytest test_routing.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/breaking-bump/routing.py scripts/breaking-bump/test_routing.py
git commit -s -m "feat(breaking-bump): deterministic dispatch + gate routing"
```

---

### Task 4: identity.py — dedup identity, slug, branch name

**Files:**
- Create: `scripts/breaking-bump/identity.py`
- Test: `scripts/breaking-bump/test_identity.py`

Implements the canonical dedup identity `<dep>@<from>→<to>` and its ASCII slug (spec #6, #11), and D's claude branch name (#6).

- [ ] **Step 1: Write the failing tests**

Create `scripts/breaking-bump/test_identity.py`:

```python
"""Unit tests for identity — dedup identity, slug, and claude branch naming."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import identity  # noqa: E402


def test_identity_is_full_transition():
    assert identity.identity("signoz", "0.122.0", "0.128.0") == "signoz@0.122.0→0.128.0"


def test_slug_is_ascii_safe_and_lowercased():
    assert identity.slug("signoz", "0.122.0", "0.128.0") == "signoz-0.122.0-0.128.0"
    # Scoped npm package names sanitise to a safe slug.
    assert identity.slug("@scope/pkg", "1.0.0", "2.0.0") == "scope-pkg-1.0.0-2.0.0"


def test_slug_collapses_unsafe_runs():
    assert identity.slug("a//b", "1.0", "2.0") == "a-b-1.0-2.0"


def test_two_different_0x_bumps_have_distinct_identity():
    # The dedup MUST distinguish 0.122->0.128 from 0.128->0.130 (same major 0).
    a = identity.identity("signoz", "0.122.0", "0.128.0")
    b = identity.identity("signoz", "0.128.0", "0.130.0")
    assert a != b
    assert identity.slug("signoz", "0.122.0", "0.128.0") != identity.slug("signoz", "0.128.0", "0.130.0")


def test_claude_branch_name():
    assert identity.claude_branch("signoz", "0.128.0") == "claude/signoz-v0.128.0"
    assert identity.claude_branch("@scope/pkg", "2.0.0") == "claude/scope-pkg-v2.0.0"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/breaking-bump && python -m pytest test_identity.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'identity'`.

- [ ] **Step 3: Write identity.py**

Create `scripts/breaking-bump/identity.py`:

```python
"""Dedup identity + naming for a bump.

The canonical identity is the full version transition `<dep>@<from>→<to>` (NEVER
dep or dep+major — that would merge two different 0.x bumps, spec #6). The slug is
its ASCII-safe form, used for concurrency-group names and branches.
"""
from __future__ import annotations

import re

_UNSAFE = re.compile(r"[^a-zA-Z0-9._-]+")


def _safe(text: str) -> str:
    """Collapse any run of unsafe characters to a single '-', trim, lowercase."""
    return _UNSAFE.sub("-", text).strip("-").lower()


def identity(dep: str, frm: str, to: str) -> str:
    """Human-readable dedup identity; appears in the spine-issue title."""
    return f"{dep}@{frm}→{to}"


def slug(dep: str, frm: str, to: str) -> str:
    """ASCII-safe slug for concurrency groups: `<dep>-<from>-<to>` sanitised."""
    return _safe(f"{dep}-{frm}-{to}")


def claude_branch(dep: str, to: str) -> str:
    """D's fork branch name: `claude/<dep>-v<to>` (dep sanitised, version kept whole
    for uniqueness — a 0.x major would make a bare `vN` useless)."""
    return f"claude/{_safe(dep)}-v{to}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/breaking-bump && python -m pytest test_identity.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/breaking-bump/identity.py scripts/breaking-bump/test_identity.py
git commit -s -m "feat(breaking-bump): dedup identity, slug, and branch naming"
```

---

### Task 5: A→B schema + validator

**Files:**
- Create: `scripts/breaking-bump/schema/ab_contract.schema.json`
- Create: `scripts/breaking-bump/schema.py`
- Test: `scripts/breaking-bump/test_schema.py`

Implements spec #3: the A→B contract with the load-bearing invariant — every breaking-change/deprecation/removal/migration-step cites a `sourceUrl`.

- [ ] **Step 1: Write the JSON Schema**

Create `scripts/breaking-bump/schema/ab_contract.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Agent A to Agent B migration-context contract",
  "type": "object",
  "additionalProperties": false,
  "required": ["dep", "from", "to", "sourceConfidence", "sources",
               "breakingChanges", "deprecations", "removals", "migrationSteps"],
  "properties": {
    "dep": { "type": "string", "minLength": 1 },
    "from": { "type": "string", "minLength": 1 },
    "to": { "type": "string", "minLength": 1 },
    "sourceConfidence": { "enum": ["high", "medium", "low", "none"] },
    "sources": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["url", "type", "fetchedOk"],
        "properties": {
          "url": { "type": "string", "minLength": 1 },
          "type": { "enum": ["changelog", "migration-guide", "llms-txt", "release"] },
          "fetchedOk": { "type": "boolean" }
        }
      }
    },
    "breakingChanges": { "$ref": "#/$defs/findingList" },
    "deprecations": { "$ref": "#/$defs/findingList" },
    "removals": { "$ref": "#/$defs/findingList" },
    "migrationSteps": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["instruction", "sourceUrl"],
        "properties": {
          "instruction": { "type": "string", "minLength": 1 },
          "sourceUrl": { "type": "string", "minLength": 1 }
        }
      }
    }
  },
  "$defs": {
    "findingList": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["summary", "detail", "sourceUrl"],
        "properties": {
          "summary": { "type": "string", "minLength": 1 },
          "detail": { "type": "string", "minLength": 1 },
          "sourceUrl": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/breaking-bump/test_schema.py`:

```python
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd scripts/breaking-bump && python -m pytest test_schema.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'schema'`.

- [ ] **Step 4: Write schema.py**

Create `scripts/breaking-bump/schema.py`:

```python
"""Validate Agent A's output against the A->B contract schema.

The load-bearing invariant (spec #3) — every breaking-change / deprecation /
removal / migration-step cites a `sourceUrl` — is enforced by `required` in the
schema file, so a doc missing any sourceUrl fails validation.
"""
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd scripts/breaking-bump && python -m pytest test_schema.py -v`
Expected: PASS (6 tests; the two `@given` properties run many examples each).

- [ ] **Step 6: Commit**

```bash
git add scripts/breaking-bump/schema/ab_contract.schema.json scripts/breaking-bump/schema.py scripts/breaking-bump/test_schema.py
git commit -s -m "feat(breaking-bump): A->B contract schema + validator"
```

---

### Task 6: issue.py — context block + dedup

**Files:**
- Create: `scripts/breaking-bump/issue.py`
- Test: `scripts/breaking-bump/test_issue.py`

Implements the spine-issue context block (machine-readable, hidden in the body) and the find-existing dedup on the full transition (spec #6, #11). Pure functions over already-fetched issue dicts — the actual `gh` calls live in the workflow.

- [ ] **Step 1: Write the failing tests**

Create `scripts/breaking-bump/test_issue.py`:

```python
"""Unit tests for issue — context-block render/parse and dedup."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import issue  # noqa: E402


def test_render_then_parse_roundtrips():
    body = issue.render_context_block("signoz", "0.122.0", "0.128.0", 814)
    ctx = issue.parse_context_block(body)
    assert ctx == {"dep": "signoz", "from": "0.122.0", "to": "0.128.0", "pr": 814}


def test_context_block_is_hidden_html_comment():
    body = issue.render_context_block("signoz", "0.122.0", "0.128.0", 1)
    assert body.startswith("<!--")
    assert body.rstrip().endswith("-->")


def test_parse_missing_block_returns_none():
    assert issue.parse_context_block("just some prose, no block") is None
    assert issue.parse_context_block("") is None


def test_parse_malformed_json_returns_none():
    bad = "<!-- breaking-bump:context\n{not json}\n-->"
    assert issue.parse_context_block(bad) is None


def test_issue_title_carries_identity():
    assert issue.issue_title("signoz", "0.122.0", "0.128.0") == "breaking-bump: signoz@0.122.0→0.128.0"


def test_find_existing_matches_on_full_transition():
    body = issue.render_context_block("signoz", "0.122.0", "0.128.0", 1)
    issues = [{"number": 5, "title": issue.issue_title("signoz", "0.122.0", "0.128.0"), "body": body}]
    assert issue.find_existing(issues, "signoz", "0.122.0", "0.128.0") == issues[0]


def test_find_existing_distinguishes_two_0x_bumps():
    body = issue.render_context_block("signoz", "0.122.0", "0.128.0", 1)
    issues = [{"number": 5, "title": issue.issue_title("signoz", "0.122.0", "0.128.0"), "body": body}]
    # A different transition of the same dep must NOT match.
    assert issue.find_existing(issues, "signoz", "0.128.0", "0.130.0") is None


def test_find_existing_none_when_empty():
    assert issue.find_existing([], "signoz", "0.122.0", "0.128.0") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/breaking-bump && python -m pytest test_issue.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'issue'`.

- [ ] **Step 3: Write issue.py**

Create `scripts/breaking-bump/issue.py`:

```python
"""Spine-issue context block (machine-readable, hidden in the body) + dedup.

Pure functions over already-fetched issue dicts; the actual `gh issue` calls live
in the workflow. Dedup is on the FULL transition `<dep>@<from>→<to>` (spec #6) so
two different 0.x bumps of the same dep never collide.
"""
from __future__ import annotations

import json
import re

from identity import identity

_BLOCK_RE = re.compile(r"<!-- breaking-bump:context\n(?P<json>.*?)\n-->", re.DOTALL)


def render_context_block(dep: str, frm: str, to: str, pr: int) -> str:
    """The machine-readable context block embedded (invisibly) in the issue body."""
    payload = json.dumps({"dep": dep, "from": frm, "to": to, "pr": pr},
                         indent=2, sort_keys=True)
    return f"<!-- breaking-bump:context\n{payload}\n-->"


def parse_context_block(body: str) -> dict | None:
    """Extract the context dict from an issue body, or None if absent/malformed."""
    match = _BLOCK_RE.search(body or "")
    if not match:
        return None
    try:
        return json.loads(match.group("json"))
    except json.JSONDecodeError:
        return None


def issue_title(dep: str, frm: str, to: str) -> str:
    """Spine-issue title; carries the dedup identity for humans and search."""
    return f"breaking-bump: {identity(dep, frm, to)}"


def find_existing(issues: list[dict], dep: str, frm: str, to: str) -> dict | None:
    """Return the open `breaking-bump` issue matching this exact transition, else
    None. Matches on the parsed context block first, then the title as a fallback."""
    want = identity(dep, frm, to)
    for item in issues:
        ctx = parse_context_block(item.get("body", ""))
        if ctx and identity(ctx.get("dep", ""), ctx.get("from", ""), ctx.get("to", "")) == want:
            return item
        if want in (item.get("title") or ""):
            return item
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/breaking-bump && python -m pytest test_issue.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the whole package suite**

Run: `cd scripts/breaking-bump && python -m pytest -v`
Expected: PASS (all of test_routing, test_identity, test_schema, test_issue).

- [ ] **Step 6: Commit**

```bash
git add scripts/breaking-bump/issue.py scripts/breaking-bump/test_issue.py
git commit -s -m "feat(breaking-bump): spine-issue context block + dedup"
```

---

## Self-Review

**Spec coverage (this plan's scope only — Plans 2–4 cover the rest):**
- #1 deterministic pre-filter + semver vocabulary → `routing.dispatch_route` / `update_type` (Task 3). ✅
- #3 A→B schema + sourceUrl invariant → Task 5. ✅
- #6/#11 dedup identity + slug + claude branch → `identity.py` (Task 4), `issue.find_existing` (Task 6). ✅
- #7 AI-gate verdict route + no-doc severity → `routing.gate_route` / `nodoc_route` (Task 3). ✅
- #10 "deterministic logic in tested scripts" → entire package is pure + pytest. ✅
- #12 `scripts/breaking-bump/` layout, ADR-0068, INDEX rows, 0067 supersession → Tasks 1–2. ✅
- **Deferred to later plans (not gaps):** Step 0 workflow + AI-gate LLM call + labels + Renovate label rule + allowlist (Plan 2); A/B/C/D jobs + prompts + stub-agent plumbing test (Plan 3); live signoz run + helm-enrich absorption (Plan 4).

**Placeholder scan:** none — every code/test block is complete and runnable.

**Type/name consistency:** route constants (`SKIP`/`PIPELINE`/`AI_GATE`/`MERGEABLE`/`ESCALATE`) defined in `routing.py` and used consistently; `identity()` is the single source of the dedup string, imported by `issue.py`; `parse_semver`/`update_type` signatures match their callers; the schema's `required` lists match the keys the tests build. The no-doc rule uses the *same* `_pipeline_eligible` predicate as dispatch, so the 0.x-minor case is handled identically in both (a precise encoding of spec #7's "major + no doc → escalate", correctly extended to 0.x-minor).

---

## Execution Handoff

Plan 1 (Foundation) saved to `docs/superpowers/plans/2026-06-12-breaking-bump-foundation.md`. **Reminder:** Task 1 (ADR-0068) must merge as its own PR *before* the script PRs, per ADR-0001 §7.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review (spec-compliance then code-quality) between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session via executing-plans, batch with checkpoints.

Which approach? (And: write Plans 2–4 now, or implement Plan 1 first then plan the next phase?)
