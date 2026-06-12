# Breaking-bump Pipeline — Plan 2: Prerequisites + Step 0 Dispatcher + AI Gate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the *entry* of the breaking-bump pipeline (ADR-0068): the five GitHub labels, the Renovate `update:<type>` label rule, the signoz-only allowlist, §6a suppression on `renovate/*`, the deterministic Step 0 dispatcher workflow, and the cheap AI gate. Step 0 reads a Renovate PR, gates on the allowlist (zero cost off-allowlist), routes via the already-merged Plan 1 Python core, and either creates the spine issue or stamps the PR mergeable. The downstream pipeline (Agents A–D, `breaking-bump.yml on: issues`) is **Plan 3+** — out of scope here.

**Architecture:** All deterministic decisions live in pure, unit-tested Python under `scripts/breaking-bump/` (Plan 1 bedrock + two new helpers added here: `allowlist.py`, `prmeta.py`). Workflow YAML stays thin and shells out to those modules (`python -c`/CLI), mirroring `helm-bump-enrich.yml`. The AI gate is one scoped `claude-code-action` job mirroring `helm-bump-enrich.yml`'s invocation; its verdict is fed back through `routing.gate_route`. Labels are bootstrapped by a `workflow_dispatch` one-shot workflow using `gh label create`. The allowlist is a committed YAML list (single source of truth the dispatcher reads first), *not* a Renovate label — so off-allowlist short-circuits before any Claude call.

**Tech Stack:** Python 3.14 + pytest (matches `scripts/breaking-bump/` + `breaking-bump-tests.yml`); GitHub Actions + `anthropics/claude-code-action@v1` (reusing `CLAUDE_CODE_OAUTH_TOKEN` / `CLAUDE_BOT_PAT`); Renovate (`renovate.json`); `gh` CLI.

**Source spec:** `docs/superpowers/specs/2026-06-11-renovate-bump-supervisor-design.md`. Read it before starting — this plan implements its **Prerequisites** section (#1–#5), the **Step 0 — dispatcher** and **AI gate** agent contracts, and resolved OPEN QUESTIONS #1, #7, #11, #12, #13.

**Depends on (already on `main`):** `scripts/breaking-bump/routing.py` (`dispatch_route`, `update_type`, `parse_semver`, `gate_route`, `nodoc_route`, route constants `SKIP/PIPELINE/AI_GATE/MERGEABLE/ESCALATE`), `scripts/breaking-bump/issue.py` (`render_context_block`, `parse_context_block`, `issue_title`, `find_existing`), `scripts/breaking-bump/identity.py` (`identity`, `slug`, `claude_branch`), `scripts/breaking-bump/schema.py`, `.github/workflows/breaking-bump-tests.yml`, ADR-0068.

**Scope boundary — NOT in this plan:** Agents A/B/C/D, `breaking-bump.yml` (`on: issues`), the agent prompts under `.github/breaking-bump/prompts/`, `helm-bump-enrich.yml` retirement, the live signoz run. Those are Plan 3+. This plan ends the moment a spine issue is *created* (the `on: issues` event that the pipeline consumes is fired by GitHub; Plan 3 handles it).

---

## ADR pre-read (do this first, once)

This plan touches `.github/workflows/`, `renovate.json`, and `scripts/`. Run:

```bash
scripts/adr-context.sh .github/workflows/claude-code-review.yml .github/workflows/breaking-bump-dispatch.yml renovate.json scripts/breaking-bump/routing.py
```

Read every ADR it emits in full before writing code (per CLAUDE.md). Landmarks: ADR-0068 (this pipeline — already merged), ADR-0001 (workflow, 400-line cap, §6a), ADR-0067 (helm-enrich, superseded by 0068 — the model for the AI-gate job). No new ADR is needed: ADR-0068 already registers `.github/workflows/breaking-bump-*.yml` and `scripts/breaking-bump/**`.

## Local prerequisite

Commands below invoke `python` (CI's `setup-python` provides it). On macOS the binary is `python3` — alias it or run the test commands as `python3 -m pytest ...`. First: `pip install -r scripts/breaking-bump/requirements.txt` (pytest + jsonschema + hypothesis + pyyaml).

## Deployment preconditions (document, do not implement)

- **`CLAUDE_BOT_PAT` must be provisioned with `workflows` scope** before Wave 2 merges. Prerequisites #3: the §6a-suppression edit (Wave 2) touches `.github/workflows/claude-code-review.yml`; the default `GITHUB_TOKEN` *cannot* push workflow-file edits. The repo already threads `CLAUDE_BOT_PAT` through `claude-code-review.yml`'s checkout. This plan's *edit* lands via normal PR review (a human pushes it), so the PAT is not needed to land Wave 2 — but it **is** needed once Agent D (Plan 4) edits its own YAML. Flag it as a standing deploy precondition in the Wave-2 PR body.
- **`CLAUDE_CODE_OAUTH_TOKEN`** is already provisioned (used by `claude-code-review.yml`, `helm-bump-enrich.yml`). The AI gate reuses it.

---

## Execution model: waves of PRs

Four PR waves; each goes through its full review cycle (§6a + maintainer) and **merges before the next wave starts**, so review feedback can reshape what follows. Each wave is < 400 lines of hand-written diff.

| Wave / PR | Title (one line) | Files | Why this order |
|---|---|---|---|
| **Wave 1** | labels bootstrap + Renovate `update:<type>` rule + allowlist | `breaking-bump-labels.yml`, `renovate.json`, `scripts/breaking-bump/allowlist.py` (+test), `allowlist.yaml` | Pure prerequisites with no dependency on each other's runtime; the dispatcher (Wave 3) needs all three to exist. No AI, fully testable. |
| **Wave 2** | §6a suppression on `renovate/*` | `claude-code-review.yml` | Tiny, isolated, must land **before** Wave 3 so the dispatcher and Renovate PRs aren't clobbered by §6a. One-line `if`. |
| **Wave 3** | Step 0 dispatcher (router, no AI) + `prmeta` helper | `scripts/breaking-bump/prmeta.py` (+test), `breaking-bump-dispatch.yml` | The deterministic router: allowlist gate → parse → route → create-issue / hand to gate. Needs Waves 1–2 merged. The AI-gate *call* is stubbed/guarded here. |
| **Wave 4** | AI gate job (changelog smell test) | `breaking-bump-dispatch.yml` (add the gate job), `.github/breaking-bump/prompts/ai-gate.md` | The one `claude-code-action` job + its verdict→route wiring. Bolts onto the Wave-3 dispatcher's `ai-gate` route. Last because it is the only LLM cost and the only piece needing the prompt file. |

> Rationale for splitting the dispatcher (Wave 3) from the AI gate (Wave 4): Wave 3 is fully deterministic and unit-testable; Wave 4 introduces the only `claude-code-action` invocation. Keeping them separate lets the router land and be exercised on a real allowlisted *pipeline-eligible* bump (signoz, a 0.x → routes straight to PIPELINE, never touching the gate) before any LLM wiring is trusted — matching the spec's "Step 0 = zero tokens" property and the rollout-confidence-ratchet posture (#13).

---

## File Structure

| File | Wave | New/Mod | Responsibility |
|---|---|---|---|
| `.github/workflows/breaking-bump-labels.yml` | 1 | New | `workflow_dispatch` one-shot: `gh label create` the 5 labels (idempotent). |
| `renovate.json` | 1 | Mod | Add a `packageRules` `addLabels` rule keyed on `matchUpdateTypes` → `update:major`/`update:minor`/`update:patch`. |
| `scripts/breaking-bump/allowlist.py` | 1 | New | Load + query the committed allowlist YAML. `is_allowlisted(dep, allowlist)`, `load_allowlist(path)`. |
| `scripts/breaking-bump/allowlist.yaml` | 1 | New | The committed allowlist (signoz only at first). |
| `scripts/breaking-bump/test_allowlist.py` | 1 | New | Unit tests for `allowlist.py`. |
| `.github/workflows/claude-code-review.yml` | 2 | Mod | Job-level `if` excluding `startsWith(github.head_ref, 'renovate/')`. |
| `scripts/breaking-bump/prmeta.py` | 3 | New | Parse `dep`/`from`/`to` from a Renovate PR (title + body version table) and the update-type from the `update:<type>` label. |
| `scripts/breaking-bump/test_prmeta.py` | 3 | New | Unit tests for `prmeta.py` (real Renovate title/body fixtures). |
| `.github/workflows/breaking-bump-dispatch.yml` | 3 | New | Step 0 router (`on: pull_request`). Allowlist gate → parse → `dispatch_route` → create spine issue / route to gate. |
| `.github/breaking-bump/prompts/ai-gate.md` | 4 | New | The AI-gate prompt (changelog-only smell test → verdict file). |
| `.github/workflows/breaking-bump-dispatch.yml` | 4 | Mod | Add the `ai-gate` job + verdict→route wiring + spine-issue-on-breaking. |

`breaking-bump-tests.yml` already globs `scripts/breaking-bump/**`, so the new `test_*.py` files run in CI automatically — no workflow edit needed for tests.

---

## Locked implementation decisions (where the spec left a choice)

1. **Allowlist mechanism = a committed YAML file, read by tested Python — NOT a Renovate label.** The spec (#13, Step 0 contract) says the allowlist "gates the whole dispatcher, the AI gate included," and a non-allowlisted dep must "short-circuit before any Claude call." A Renovate label can't do that cleanly (it would couple the gate to Renovate's label timing and to `renovate.json` churn each time the ratchet expands). A committed `scripts/breaking-bump/allowlist.yaml` is the single source of truth the dispatcher reads *first*, is greppable/reviewable, and expands by a one-line PR (the confidence ratchet). Matching is on the **dep name** Step 0 extracts.
2. **Dep/from/to extraction (`prmeta.py`).** Renovate PR titles are not a reliable source of the *from* version; the authoritative pair lives in Renovate's PR **body** version table (e.g. `| [signoz](...) | minor | \`0.122.0\` -> \`0.128.0\` |`). `prmeta.parse_versions(title, body)` extracts `dep` from the title and `from`/`to` from the first body table row; `prmeta.update_type_label(labels)` reads the authoritative `update:<type>` from the Renovate label (Prerequisite #1). The dispatcher cross-checks: if the label is absent (label rule not yet applied), it falls back to `routing.update_type(frm, to)`. Both paths are deterministic and tested.
3. **AI-gate verdict transport = a one-word file `/tmp/gate-verdict.txt` written by the agent, read bash-side.** Mirrors `claude-code-review.yml`'s `/tmp/review.md` pattern (agent writes a file; the workflow reads it; the agent has no `gh`/issue capability that could double-act). The verdict is one of `green|breaking|ambiguous`; the bash step feeds it to `routing.gate_route`. Absent/empty file → fail-safe to `breaking` (→ pipeline), matching `gate_route`'s "else → PIPELINE."
4. **"Stamp mergeable" on the AI-gate-green path = a single one-line PR comment, no issue, no label** (spec AI-gate contract: "Green = silent stamp (no comment)" is the *default*; the contract also permits "at most a one-line comment"). Decision: post **one** idempotent comment `<!-- breaking-bump:cleared -->` so a human sees the gate ran, and re-runs (synchronize) don't double-post. No issue is created on this path, so no label. (The `ai-cleared` *label* is only for the B-early-exit path, which is Plan 3 — not here.)
5. **No-doc severity is handled inside the AI gate (Wave 4) via `routing.nodoc_route`,** not in the deterministic router: a `>=1.x` minor/patch reaching the gate with no changelog → `nodoc_route(...) == MERGEABLE` → stamp. (A major / 0.x never reaches the gate — it's PIPELINE-routed deterministically; its no-doc handling is Gate A inside Agent A, Plan 3.)

---

# Wave 1 — labels + Renovate label rule + allowlist

## Task 1.1 — write the allowlist helper test (RED)

- [ ] Create `scripts/breaking-bump/test_allowlist.py`:

```python
"""Unit tests for allowlist — the signoz-only rollout gate (#13)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import allowlist  # noqa: E402


def test_load_allowlist_reads_deps_list(tmp_path):
    f = tmp_path / "allowlist.yaml"
    f.write_text("deps:\n  - signoz\n  - cert-manager\n")
    assert allowlist.load_allowlist(f) == ["signoz", "cert-manager"]


def test_load_allowlist_empty_when_no_deps_key(tmp_path):
    f = tmp_path / "allowlist.yaml"
    f.write_text("deps: []\n")
    assert allowlist.load_allowlist(f) == []


def test_is_allowlisted_exact_match():
    assert allowlist.is_allowlisted("signoz", ["signoz"]) is True


def test_is_allowlisted_rejects_non_member():
    # The whole point of signoz-only: everything else short-circuits.
    assert allowlist.is_allowlisted("react", ["signoz"]) is False


def test_is_allowlisted_is_case_insensitive():
    assert allowlist.is_allowlisted("SigNoz", ["signoz"]) is True


def test_is_allowlisted_empty_allowlist_blocks_all():
    assert allowlist.is_allowlisted("signoz", []) is False
```

- [ ] Run it, see it fail (no module yet):

```bash
cd scripts/breaking-bump && python -m pytest test_allowlist.py -v
```

Expected: `ModuleNotFoundError: No module named 'allowlist'` (collection error). This is the RED state.

## Task 1.2 — implement `allowlist.py` (GREEN)

- [ ] Create `scripts/breaking-bump/allowlist.py`:

```python
"""The rollout allowlist — gates the WHOLE dispatcher (#13, signoz-only first)."""
from __future__ import annotations

from pathlib import Path

import yaml


def load_allowlist(path: str | Path) -> list[str]:
    """Load the committed allowlist YAML; returns the `deps` list (or [])."""
    data = yaml.safe_load(Path(path).read_text()) or {}
    return list(data.get("deps") or [])


def is_allowlisted(dep: str, allowlist: list[str]) -> bool:
    """True iff `dep` is on the rollout allowlist (case-insensitive)."""
    target = dep.strip().lower()
    return any(target == entry.strip().lower() for entry in allowlist)
```

- [ ] Run it, see it pass:

```bash
cd scripts/breaking-bump && python -m pytest test_allowlist.py -v
```

Expected: `6 passed`.

## Task 1.3 — commit the allowlist helper

- [ ] Create `scripts/breaking-bump/allowlist.yaml`:

```yaml
# Rollout allowlist for the breaking-bump pipeline (ADR-0068, #13).
# The dispatcher gates on this FIRST — a dep not listed here short-circuits
# Step 0 with zero Claude cost. Expand one dep at a time as the pipeline
# earns trust (the confidence ratchet); remove/invert to a denylist on
# promotion to the whole tree.
deps:
  - signoz
```

- [ ] Stage and commit:

```bash
git add scripts/breaking-bump/allowlist.py scripts/breaking-bump/test_allowlist.py scripts/breaking-bump/allowlist.yaml
git commit -s -m "feat(breaking-bump): add rollout allowlist gate (signoz only)"
```

(Subject 61 chars, lowercase-led, type `feat` ✓.)

## Task 1.4 — add the Renovate `update:<type>` label rule

- [ ] Edit `renovate.json`: insert this object as the **first** element of the existing `packageRules` array (before the "Vite + Vitest…" rule), so the `addLabels` applies to every PR and later, more-specific rules still layer on top:

```json
    {
      "description": "Stamp the semver update-type as a label so the breaking-bump dispatcher (ADR-0068, Step 0) can route on it deterministically.",
      "matchUpdateTypes": ["major", "minor", "patch"],
      "addLabels": ["update:{{updateType}}"]
    },
```

- [ ] Validate JSON parses:

```bash
python -c "import json; json.load(open('renovate.json')); print('renovate.json OK')"
```

Expected: `renovate.json OK`.

- [ ] (Optional, if `npx` available) sanity-lint the config:

```bash
npx --yes --package renovate -- renovate-config-validator renovate.json
```

Expected: `INFO: Validating renovate.json` … `Config validated successfully`. If `npx` is offline, the `json.load` check above is the gate; CI's Renovate run is the real validator.

- [ ] Commit:

```bash
git add renovate.json
git commit -s -m "feat(infra): stamp renovate update-type labels for breaking-bump routing"
```

(Subject 72 chars, lowercase-led, type `feat`, scope `infra` per CLAUDE.md cross-cutting guidance ✓.)

## Task 1.5 — add the labels-bootstrap workflow

- [ ] Create `.github/workflows/breaking-bump-labels.yml` (complete file):

```yaml
name: breaking-bump-labels

# One-shot bootstrap of the five breaking-bump labels (ADR-0068, #12).
# Run manually once per repo: Actions -> breaking-bump-labels -> Run workflow.
# Idempotent: `gh label create --force` updates an existing label in place,
# so re-running is safe.

on:
  workflow_dispatch:

permissions:
  issues: write

jobs:
  create-labels:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - name: Create breaking-bump labels
        run: |
          set -euo pipefail
          gh label create "ai-driven" --color "5319E7" \
            --description "Origin: machine-generated by an AI automation (ADR-0068)." \
            --force --repo "${{ github.repository }}"
          gh label create "breaking-bump" --color "B60205" \
            --description "Kind: spine/tracking issue for a supervised breaking dependency bump." \
            --force --repo "${{ github.repository }}"
          gh label create "post-bump-enhancement" --color "0E8A16" \
            --description "Kind: optional opportunistic refactor enabled by a bump (do later, separately)." \
            --force --repo "${{ github.repository }}"
          gh label create "needs-human" --color "D93F0B" \
            --description "Status: escalation/failure — a human must act (cumulative)." \
            --force --repo "${{ github.repository }}"
          gh label create "ai-cleared" --color "C2E0C6" \
            --description "Status: pipeline reviewed the bump and cleared it (cumulative)." \
            --force --repo "${{ github.repository }}"
```

- [ ] Validate the YAML parses:

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/breaking-bump-labels.yml')); print('labels yaml OK')"
```

Expected: `labels yaml OK`.

- [ ] Commit:

```bash
git add .github/workflows/breaking-bump-labels.yml
git commit -s -m "feat(ci): add breaking-bump labels bootstrap workflow"
```

(Subject 53 chars, lowercase-led, type `feat`, scope `ci` ✓.)

> **Wave-1 PR body must note:** after merge, a human runs the `breaking-bump-labels` workflow once (Actions → Run workflow) so the five labels exist before the dispatcher (Wave 3) tries `gh issue create --label breaking-bump` (which fails on a missing label, Prerequisite #4).

---

# Wave 2 — §6a suppression on `renovate/*`

## Task 2.1 — add the job-level `if` to `claude-code-review.yml`

- [ ] Edit `.github/workflows/claude-code-review.yml`. Find the `claude-review` job's existing `if`:

```yaml
  claude-review:
    if: ${{ !github.event.pull_request.draft }}
```

Replace with (exclude Renovate branches — the pipeline replaces §6a on those, #7):

```yaml
  claude-review:
    # §6a is suppressed on renovate/* branches: the breaking-bump pipeline
    # (ADR-0068) owns those PRs, and §6a's fixer must never push to a
    # Renovate branch (the #814 clobber). The real §6a still runs on the
    # claude/<dep>-vN PR and every other branch.
    if: ${{ !github.event.pull_request.draft && !startsWith(github.head_ref, 'renovate/') }}
```

- [ ] Validate the YAML parses:

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/claude-code-review.yml')); print('review yaml OK')"
```

Expected: `review yaml OK`.

- [ ] Confirm the `if` is the only change:

```bash
git diff --stat .github/workflows/claude-code-review.yml
```

Expected: `1 file changed, 5 insertions(+), 1 deletion(-)` (the 4-line comment + the new condition replacing the old one).

- [ ] Commit:

```bash
git add .github/workflows/claude-code-review.yml
git commit -s -m "fix(ci): suppress section 6a review on renovate branches"
```

(Subject 56 chars, lowercase-led, type `fix`, scope `ci`. Note: avoid the literal `§` in the subject — keep ASCII for commitlint safety; the comment in the file carries the `§6a` reference ✓.)

> **Wave-2 PR body must note** the `CLAUDE_BOT_PAT` `workflows`-scope precondition (Prerequisite #3): this edit lands via a human-pushed PR, but Agent D (Plan 4) will need the PAT to edit workflow files. Document it as a standing deploy precondition.

---

# Wave 3 — Step 0 dispatcher (router, no AI)

## Task 3.1 — write the `prmeta` helper test (RED)

- [ ] Create `scripts/breaking-bump/test_prmeta.py`:

```python
"""Unit tests for prmeta — extracting dep/from/to + update-type from a Renovate PR."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import prmeta  # noqa: E402

# A real-shaped Renovate PR body: the version table is the authoritative source.
_BODY = """\
This PR contains the following updates:

| Package | Type | Update | Change |
|---|---|---|---|
| [signoz](https://github.com/SigNoz/charts) | helm | minor | `0.122.0` -> `0.128.0` |

---

### Release Notes
...
"""


def test_parse_versions_from_body_table():
    dep, frm, to = prmeta.parse_versions(
        "chore(deps): update helm release signoz to v0.128.0", _BODY
    )
    assert dep == "signoz"
    assert frm == "0.122.0"
    assert to == "0.128.0"


def test_parse_versions_strips_v_prefix_in_table():
    body = _BODY.replace("`0.122.0` -> `0.128.0`", "`v0.122.0` -> `v0.128.0`")
    _, frm, to = prmeta.parse_versions("chore(deps): update signoz", body)
    assert frm == "v0.122.0"
    assert to == "v0.128.0"  # routing.parse_semver normalises the prefix downstream


def test_parse_versions_returns_none_without_table():
    assert prmeta.parse_versions("chore(deps): update signoz", "no table here") is None


def test_update_type_label_reads_authoritative_label():
    assert prmeta.update_type_label(["dependencies", "update:minor"]) == "minor"
    assert prmeta.update_type_label(["update:major", "security"]) == "major"


def test_update_type_label_absent_returns_none():
    assert prmeta.update_type_label(["dependencies"]) is None
```

- [ ] Run it, see it fail:

```bash
cd scripts/breaking-bump && python -m pytest test_prmeta.py -v
```

Expected: `ModuleNotFoundError: No module named 'prmeta'`. RED state.

## Task 3.2 — implement `prmeta.py` (GREEN)

- [ ] Create `scripts/breaking-bump/prmeta.py`:

```python
"""Extract bump metadata from a Renovate PR: dep/from/to + the update-type label."""
from __future__ import annotations

import re

# Renovate's PR-body version table row, e.g.:
#   | [signoz](https://...) | helm | minor | `0.122.0` -> `0.128.0` |
_TABLE_ROW = re.compile(
    r"\|\s*\[?(?P<dep>[^\]\|]+?)\]?(?:\([^)]*\))?\s*\|"   # dep cell (optional [..](..))
    r"[^|]*\|[^|]*\|"                                       # type + update cells
    r"\s*`(?P<from>[^`]+)`\s*->\s*`(?P<to>[^`]+)`\s*\|"     # change cell: `from` -> `to`
)
_UPDATE_LABEL = re.compile(r"^update:(?P<type>major|minor|patch)$")


def parse_versions(title: str, body: str) -> tuple[str, str, str] | None:
    """Return (dep, from, to) from the Renovate PR body table, or None if absent.

    The body table is authoritative for the version pair; the dep name comes
    from the same row (the title's dep rendering is inconsistent across
    managers). Strips a leading `@scope/` nothing — the raw dep token is kept
    so the allowlist match (case-insensitive) stays predictable.
    """
    match = _TABLE_ROW.search(body or "")
    if not match:
        return None
    return match.group("dep").strip(), match.group("from").strip(), match.group("to").strip()


def update_type_label(labels: list[str]) -> str | None:
    """Return 'major'|'minor'|'patch' from the `update:<type>` label, or None."""
    for label in labels:
        m = _UPDATE_LABEL.match(label.strip())
        if m:
            return m.group("type")
    return None
```

- [ ] Run it, see it pass:

```bash
cd scripts/breaking-bump && python -m pytest test_prmeta.py -v
```

Expected: `5 passed`.

- [ ] Run the **whole** package to confirm no regression:

```bash
cd scripts/breaking-bump && python -m pytest -v
```

Expected: all Plan-1 tests + the new `allowlist`/`prmeta` tests pass.

- [ ] Commit:

```bash
git add scripts/breaking-bump/prmeta.py scripts/breaking-bump/test_prmeta.py
git commit -s -m "feat(breaking-bump): parse dep/from/to + update-type from renovate pr"
```

(Subject 69 chars, lowercase-led, type `feat` ✓.)

## Task 3.3 — add the dispatcher workflow (no AI yet)

- [ ] Create `.github/workflows/breaking-bump-dispatch.yml` (complete file). Wave 3 wires the deterministic route fully; the `ai-gate` route is a **placeholder no-op step** that Wave 4 replaces with the real job:

```yaml
name: breaking-bump-dispatch

# Step 0 — the deterministic dispatcher (ADR-0068, OPEN QUESTIONS #1/#7/#11).
# Runs on every renovate/* PR. Gates on the rollout allowlist FIRST (zero
# Claude cost off-allowlist), reads the update-type label, routes via the
# tested scripts/breaking-bump/ core, and either creates the spine issue
# (pipeline-eligible) or hands off to the AI gate (>=1.x minor/patch).
# Idempotent: skips if a spine issue already exists for this dep@from->to.

on:
  pull_request:
    types: [opened, synchronize, reopened]

concurrency:
  # Serialises near-simultaneous opened+synchronize events to close the
  # find-or-create TOCTOU window (Step 0 contract). cancel-in-progress:false
  # so a slug-collision queues rather than kills an in-flight create.
  group: step0-${{ github.event.pull_request.number }}
  cancel-in-progress: false

permissions:
  contents: read
  pull-requests: write
  issues: write
  id-token: write

jobs:
  dispatch:
    # Renovate branches only.
    if: ${{ startsWith(github.head_ref, 'renovate/') }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      PR_NUMBER: ${{ github.event.pull_request.number }}
    outputs:
      route: ${{ steps.route.outputs.route }}
      dep: ${{ steps.parse.outputs.dep }}
      from: ${{ steps.parse.outputs.from }}
      to: ${{ steps.parse.outputs.to }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with:
          fetch-depth: 1
      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
        with:
          python-version: '3.14.6'
      - run: pip install -r scripts/breaking-bump/requirements.txt

      - name: Parse bump metadata
        id: parse
        run: |
          set -euo pipefail
          gh pr view "$PR_NUMBER" --json title,body,labels \
            --jq '{title, body, labels: [.labels[].name]}' > /tmp/pr.json
          python - <<'PY'
          import json, os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import prmeta
          pr = json.load(open("/tmp/pr.json"))
          parsed = prmeta.parse_versions(pr["title"], pr["body"] or "")
          out = open(os.environ["GITHUB_OUTPUT"], "a")
          if parsed is None:
              # No version table -> not a parseable single bump; no-op (e.g. a
              # lockfile-maintenance or grouped PR). Step 0 does nothing.
              out.write("parsed=false\n")
              sys.exit(0)
          dep, frm, to = parsed
          ut_label = prmeta.update_type_label(pr["labels"])
          out.write("parsed=true\n")
          out.write(f"dep={dep}\nfrom={frm}\nto={to}\n")
          out.write(f"label_update_type={ut_label or ''}\n")
          PY

      - name: Allowlist gate (FIRST — zero cost off-allowlist)
        id: gate
        if: steps.parse.outputs.parsed == 'true'
        run: |
          set -euo pipefail
          python - <<'PY'
          import os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import allowlist
          deps = allowlist.load_allowlist("scripts/breaking-bump/allowlist.yaml")
          ok = allowlist.is_allowlisted(os.environ["DEP"], deps)
          with open(os.environ["GITHUB_OUTPUT"], "a") as out:
              out.write(f"allowlisted={'true' if ok else 'false'}\n")
          PY
        env:
          DEP: ${{ steps.parse.outputs.dep }}

      - name: Idempotency — skip if a spine issue already exists
        id: dedup
        if: steps.gate.outputs.allowlisted == 'true'
        run: |
          set -euo pipefail
          gh issue list --label breaking-bump --state open --limit 200 \
            --json number,title,body > /tmp/issues.json
          python - <<'PY'
          import json, os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import issue
          issues = json.load(open("/tmp/issues.json"))
          existing = issue.find_existing(
              issues, os.environ["DEP"], os.environ["FROM"], os.environ["TO"])
          with open(os.environ["GITHUB_OUTPUT"], "a") as out:
              out.write(f"exists={'true' if existing else 'false'}\n")
          PY
        env:
          DEP: ${{ steps.parse.outputs.dep }}
          FROM: ${{ steps.parse.outputs.from }}
          TO: ${{ steps.parse.outputs.to }}

      - name: Route
        id: route
        if: steps.gate.outputs.allowlisted == 'true' && steps.dedup.outputs.exists == 'false'
        run: |
          set -euo pipefail
          python - <<'PY'
          import os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import routing
          frm, to = os.environ["FROM"], os.environ["TO"]
          # Prefer the authoritative Renovate label; fall back to deriving it.
          ut = os.environ.get("LABEL_UPDATE_TYPE") or routing.update_type(frm, to)
          current_major, _, _ = routing.parse_semver(frm)
          route = routing.dispatch_route(ut, current_major, on_allowlist=True)
          with open(os.environ["GITHUB_OUTPUT"], "a") as out:
              out.write(f"route={route}\n")
          print(f"::notice::breaking-bump route for {os.environ['DEP']} "
                f"{frm}->{to} ({ut}): {route}")
          PY
        env:
          DEP: ${{ steps.parse.outputs.dep }}
          FROM: ${{ steps.parse.outputs.from }}
          TO: ${{ steps.parse.outputs.to }}
          LABEL_UPDATE_TYPE: ${{ steps.parse.outputs.label_update_type }}

      - name: Create spine issue (pipeline-eligible)
        if: steps.route.outputs.route == 'pipeline'
        run: |
          set -euo pipefail
          python - <<'PY'
          import os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import issue
          dep, frm, to = os.environ["DEP"], os.environ["FROM"], os.environ["TO"]
          pr = int(os.environ["PR_NUMBER"])
          title = issue.issue_title(dep, frm, to)
          body = (
              f"Spine issue for the breaking-bump pipeline (ADR-0068).\n\n"
              f"Tracking **{dep}** `{frm}` -> `{to}` (Renovate PR #{pr}).\n\n"
              + issue.render_context_block(dep, frm, to, pr)
          )
          open("/tmp/issue-title.txt", "w").write(title)
          open("/tmp/issue-body.md", "w").write(body)
          PY
          gh issue create \
            --title "$(cat /tmp/issue-title.txt)" \
            --body-file /tmp/issue-body.md \
            --label ai-driven --label breaking-bump
        env:
          DEP: ${{ steps.parse.outputs.dep }}
          FROM: ${{ steps.parse.outputs.from }}
          TO: ${{ steps.parse.outputs.to }}

      - name: AI gate (>=1.x minor/patch) — PLACEHOLDER (replaced in Wave 4)
        if: steps.route.outputs.route == 'ai-gate'
        run: |
          echo "::notice::route=ai-gate; the AI-gate job lands in Wave 4."
```

- [ ] Validate the YAML parses:

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/breaking-bump-dispatch.yml')); print('dispatch yaml OK')"
```

Expected: `dispatch yaml OK`.

- [ ] Sanity-check the embedded Python imports resolve (the workflow shells these out — verify they import cleanly):

```bash
cd scripts/breaking-bump && python -c "import prmeta, allowlist, issue, routing; print('imports OK')"
```

Expected: `imports OK`.

- [ ] Commit:

```bash
git add .github/workflows/breaking-bump-dispatch.yml
git commit -s -m "feat(ci): add step 0 breaking-bump dispatcher workflow"
```

(Subject 54 chars, lowercase-led, type `feat`, scope `ci` ✓.)

> **Wave-3 PR body must note:** the `ai-gate` route is a placeholder no-op this wave; Wave 4 replaces it with the real `claude-code-action` job. A signoz 0.x bump routes straight to `pipeline` and never hits the placeholder, so the dispatcher is fully exercisable now. **Concurrency-group caveat (OPEN QUESTION, see below):** the spec specifies `step0-<slug>` (the `dep-from-to` slug); this YAML uses `step0-<pr-number>` because the slug isn't known until after checkout+parse, and `concurrency.group` is evaluated before any step runs. PR-number keying still serialises a given PR's opened+synchronize events (the actual TOCTOU source). Flagged below.

---

# Wave 4 — AI gate (changelog smell test)

## Task 4.1 — add the AI-gate prompt

- [ ] Create `.github/breaking-bump/prompts/ai-gate.md`:

```markdown
# AI gate — changelog smell test (breaking-bump, ADR-0068)

You are the **AI gate** for a Renovate dependency-bump PR. This is a cheap,
changelog-only breaking-change smell test. You do **not** read the codebase.

## Context (from the environment)
- Dependency: `$DEP`
- Version: `$FROM` -> `$TO`
- Renovate PR: #$PR_NUMBER (its body contains the release-notes / changelog
  links Renovate gathered).

## Your task
1. Read the Renovate PR body: `gh pr view "$PR_NUMBER" --json body --jq .body`.
2. WebFetch the changelog / release-notes URL(s) Renovate linked for the range
   `$FROM` -> `$TO`. Read ONLY the changelog; do not inspect this repo's code.
3. Decide whether the upstream change between `$FROM` and `$TO` plausibly
   contains a **breaking change** for *some* consumer (you cannot know if it
   affects *us* — that is a later agent's job). Be conservative: if the notes
   are ambiguous or you cannot fetch them, do not call it green.

## Output — ONE word to /tmp/gate-verdict.txt (use the Write tool)
- `green` — the changelog clearly describes only non-breaking changes
  (fixes, internal, additive features), OR the dep is well-behaved and the
  notes are explicit and benign.
- `breaking` — the changelog names a breaking change, removal, or required
  migration step.
- `ambiguous` — changelog exists but is unclear, OR you could not fetch it.

Write exactly one of those three words (lowercase, no punctuation) to
`/tmp/gate-verdict.txt` and nothing else. The workflow reads that file and
routes deterministically; `breaking`/`ambiguous` -> the full pipeline,
`green` -> the PR is stamped mergeable.
```

- [ ] Commit:

```bash
git add .github/breaking-bump/prompts/ai-gate.md
git commit -s -m "feat(breaking-bump): add ai-gate changelog smell-test prompt"
```

(Subject 60 chars, lowercase-led, type `feat` ✓.)

## Task 4.2 — replace the placeholder with the real AI-gate job

- [ ] Edit `.github/workflows/breaking-bump-dispatch.yml`. **Delete** the placeholder step:

```yaml
      - name: AI gate (>=1.x minor/patch) — PLACEHOLDER (replaced in Wave 4)
        if: steps.route.outputs.route == 'ai-gate'
        run: |
          echo "::notice::route=ai-gate; the AI-gate job lands in Wave 4."
```

- [ ] Add a second job `ai-gate` after `dispatch` (the `dispatch` job already exposes `route`/`dep`/`from`/`to` as `outputs:` — wired in Wave 3). Append to the `jobs:` map:

```yaml
  ai-gate:
    needs: dispatch
    if: needs.dispatch.outputs.route == 'ai-gate'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
      pull-requests: write
      issues: write
      id-token: write
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      PR_NUMBER: ${{ github.event.pull_request.number }}
      DEP: ${{ needs.dispatch.outputs.dep }}
      FROM: ${{ needs.dispatch.outputs.from }}
      TO: ${{ needs.dispatch.outputs.to }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with:
          fetch-depth: 1
      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
        with:
          python-version: '3.14.6'
      - run: pip install -r scripts/breaking-bump/requirements.txt

      - name: Run the AI gate (changelog-only smell test)
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          # Renovate opens these PRs; allow it so the action doesn't refuse a
          # bot-authored event (mirrors helm-bump-enrich.yml).
          allowed_bots: 'renovate[bot],github-actions[bot]'
          # Changelog-only: WebFetch + read the PR body. No repo write, no gh
          # issue/PR mutation — the workflow does the routing side-effects.
          claude_args: '--allowed-tools "Read,Write,WebFetch,WebSearch,Bash(gh pr view:*)"'
          prompt: |
            Read .github/breaking-bump/prompts/ai-gate.md and follow it exactly.
            Substitute: DEP=${{ needs.dispatch.outputs.dep }},
            FROM=${{ needs.dispatch.outputs.from }},
            TO=${{ needs.dispatch.outputs.to }},
            PR_NUMBER=${{ github.event.pull_request.number }}.
            Write your one-word verdict to /tmp/gate-verdict.txt and nothing else.

      - name: Route on the verdict
        id: verdict
        run: |
          set -euo pipefail
          VERDICT="$(head -n1 /tmp/gate-verdict.txt 2>/dev/null | tr -d '[:space:]' || true)"
          echo "AI-gate verdict: '${VERDICT:-<none>}'"
          export VERDICT   # export into the heredoc's env; do NOT use a step-level `env: VERDICT: ${{ env.VERDICT }}` (that evaluates empty at template time)
          python - <<'PY'
          import os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import routing
          verdict = os.environ.get("VERDICT", "").strip()
          # Empty/missing -> fail-safe: treat as breaking (gate_route else-branch).
          route = routing.gate_route(verdict) if verdict else routing.PIPELINE
          with open(os.environ["GITHUB_OUTPUT"], "a") as out:
              out.write(f"route={route}\n")
          PY

      - name: Stamp mergeable (green) — idempotent PR comment, no issue
        if: steps.verdict.outputs.route == 'mergeable'
        run: |
          set -euo pipefail
          MARKER="<!-- breaking-bump:cleared -->"
          # Skip if we already stamped (synchronize re-fires Step 0).
          if gh pr view "$PR_NUMBER" --json comments \
               --jq '.comments[].body' | grep -qF "$MARKER"; then
            echo "::notice::already stamped; no-op."
            exit 0
          fi
          gh pr comment "$PR_NUMBER" --body "$MARKER
          breaking-bump AI gate: no breaking changes found in the changelog for \
          \`$DEP\` \`$FROM\` -> \`$TO\`. Safe to merge (human still clicks merge)."

      - name: Create spine issue (breaking / ambiguous)
        if: steps.verdict.outputs.route == 'pipeline'
        run: |
          set -euo pipefail
          gh issue list --label breaking-bump --state open --limit 200 \
            --json number,title,body > /tmp/issues.json
          python - <<'PY'
          import json, os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import issue
          dep, frm, to = os.environ["DEP"], os.environ["FROM"], os.environ["TO"]
          pr = int(os.environ["PR_NUMBER"])
          issues = json.load(open("/tmp/issues.json"))
          if issue.find_existing(issues, dep, frm, to):
              open("/tmp/skip", "w").write("1")  # dedup guard (synchronize re-fire)
          else:
              title = issue.issue_title(dep, frm, to)
              body = (
                  f"Spine issue for the breaking-bump pipeline (ADR-0068).\n\n"
                  f"Tracking **{dep}** `{frm}` -> `{to}` (Renovate PR #{pr}); "
                  f"routed to pipeline by the AI gate (breaking/ambiguous).\n\n"
                  + issue.render_context_block(dep, frm, to, pr)
              )
              open("/tmp/issue-title.txt", "w").write(title)
              open("/tmp/issue-body.md", "w").write(body)
          PY
          if [ ! -f /tmp/skip ]; then
            gh issue create \
              --title "$(cat /tmp/issue-title.txt)" \
              --body-file /tmp/issue-body.md \
              --label ai-driven --label breaking-bump
          else
            echo "::notice::spine issue already exists; no-op."
          fi
```

> **Note on the verdict hand-off (resolved 2026-06-12):** the `Route on the verdict` step uses **`export VERDICT`** inside the `run:` block so the heredoc's Python reads it from `os.environ`. Do **not** use a step-level `env: VERDICT: ${{ env.VERDICT }}` — a shell-assigned variable is not visible to GitHub Actions template expansion, so that form evaluates empty and the gate would never route green. The code block above already uses the correct `export` form; this note records *why*.

- [ ] Validate the YAML parses:

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/breaking-bump-dispatch.yml')); print('dispatch yaml OK')"
```

Expected: `dispatch yaml OK`.

- [ ] Confirm `gate_route` / `nodoc_route` are reachable (the no-doc severity path is the agent returning `ambiguous` on an unfetchable changelog → `gate_route('ambiguous') == PIPELINE`; for a `>=1.x` minor/patch the spec says no-doc → mergeable, so **the prompt must distinguish "benign changelog" from "no changelog"**). Decision: for the AI gate's scope (`>=1.x` minor/patch only), `nodoc_route('minor', 1) == MERGEABLE`. To honor that, add to the prompt a final rule: *"If you could not fetch any changelog at all (not merely unclear), write `green` — for a `>=1.x` minor/patch bump, absent docs means semver-low-risk, stamp mergeable."* Update `ai-gate.md` accordingly in this task:

  - [ ] Edit `.github/breaking-bump/prompts/ai-gate.md`, append under the Output section:

```markdown
## No-changelog rule (severity-scaled, #7)
This gate only runs for `>=1.x` minor/patch bumps (majors and 0.x bumps go
straight to the pipeline and never reach you). For *this* scope, if you could
not fetch **any** changelog at all, write `green` — semver says minor/patch is
low-risk and CI tests are the backstop. Reserve `ambiguous` for the case where
a changelog **exists** but you cannot tell whether it is breaking.
```

- [ ] Commit:

```bash
git add .github/workflows/breaking-bump-dispatch.yml .github/breaking-bump/prompts/ai-gate.md
git commit -s -m "feat(ci): add breaking-bump ai gate job and verdict routing"
```

(Subject 56 chars, lowercase-led, type `feat`, scope `ci` ✓.)

---

## Final verification (run before opening the Wave-4 PR)

- [ ] Whole Python package green:

```bash
cd scripts/breaking-bump && python -m pytest -v
```

Expected: all tests pass (Plan-1 + `allowlist` + `prmeta`).

- [ ] All three workflow files parse:

```bash
for f in breaking-bump-labels breaking-bump-dispatch claude-code-review; do
  python -c "import yaml; yaml.safe_load(open('.github/workflows/$f.yml')); print('$f OK')"
done
```

Expected: three `… OK` lines.

- [ ] `renovate.json` parses and the new rule is present:

```bash
python -c "import json; d=json.load(open('renovate.json')); assert any('addLabels' in r for r in d['packageRules']); print('renovate rule OK')"
```

Expected: `renovate rule OK`.

---

## Spec-coverage map (self-review)

| Spec item | Where covered |
|---|---|
| Prereq #1 — Renovate `update:<type>` label | Wave 1, Task 1.4 |
| Prereq #2 — §6a suppression on `renovate/*` | Wave 2, Task 2.1 |
| Prereq #3 — `CLAUDE_BOT_PAT` workflows-scope precondition | Documented in Wave-2 PR body + Deployment preconditions |
| Prereq #4 — the 5 labels | Wave 1, Task 1.5 |
| Prereq #5 — rollout allowlist | Wave 1, Tasks 1.1–1.3 |
| Step 0 — allowlist gate FIRST (zero cost) | Wave 3, dispatch `gate` step |
| Step 0 — read update-type label + extract dep/from/to | Wave 3, `prmeta` + `parse` step |
| Step 0 — `dispatch_route` call | Wave 3, `route` step |
| Step 0 — idempotency (`find_existing`) | Wave 3, `dedup` step (+ Wave 4 issue-create guard) |
| Step 0 — concurrency group | Wave 3, `concurrency:` (PR-number keyed — see OPEN QUESTION) |
| Step 0 — spine issue (`ai-driven`+`breaking-bump`, `render_context_block`/`issue_title`) | Wave 3, `Create spine issue` step |
| AI gate — `claude-code-action` job, changelog-only | Wave 4, `ai-gate` job |
| AI gate — verdict → `gate_route` | Wave 4, `Route on the verdict` step |
| AI gate — green → stamp mergeable (comment, no issue) | Wave 4, `Stamp mergeable` step |
| AI gate — breaking/ambiguous → spine issue | Wave 4, `Create spine issue (breaking/ambiguous)` step |
| AI gate — no-doc severity (`nodoc_route` intent) | Wave 4, Task 4.2 prompt no-changelog rule |
| New helper #1 (`allowlist`) with tests | Wave 1, Tasks 1.1–1.3 |
| New helper #2 (`prmeta`) with tests | Wave 3, Tasks 3.1–3.2 |

---

## OPEN QUESTIONS (flagged, not silently guessed)

1. **Concurrency group is `step0-<pr-number>`, not the spec's `step0-<slug>`.**
   The spec specifies `step0-<slug>` where `<slug> = <dep>-<from>-<to>`. But
   `concurrency.group` is evaluated **before any job step runs**, so the slug
   (which requires checking out the repo and parsing the PR) is not yet known.
   PR-number keying still serialises a single PR's `opened`+`synchronize`
   events — the actual TOCTOU source the spec's idempotency guard targets, since
   a given dep@from→to maps to exactly one Renovate PR. The only case
   PR-number-keying *doesn't* serialise is two *different* PRs racing on the same
   identity, which Renovate does not produce. **Recommendation:** accept
   PR-number keying; if the maintainer insists on the literal `step0-<slug>`,
   it requires a two-job split (a cheap parse job that emits the slug as an
   output, then the real job with `concurrency.group:
   step0-${{ needs.parse.outputs.slug }}`) — a real cost for a case that can't
   occur. Decision deferred to maintainer; default is PR-number keying.

2. ✅ **RESOLVED (2026-06-12).** The Wave-4 verdict hand-off now uses
   `export VERDICT` inside the `run:` block (the step-level `env:` form is gone),
   so the heredoc's Python reads it correctly. Verified by the cold review.

3. **`prmeta.parse_versions` regex is fitted to Renovate's *current* PR-body
   table shape.** If Renovate's body template changes (or a grouped/lockfile PR
   has no single-row table), `parse_versions` returns `None` and Step 0 no-ops —
   safe-by-default, but it means a future Renovate template change silently
   disables routing for affected PRs. **Recommendation (not in this plan's
   scope):** the live signoz run (Plan 3 / #10) is the validation; if the regex
   misses, tighten it against the real PR #814 / signoz body captured then. A
   committed fixture from a real Renovate PR would harden this — deferred to the
   live-test wave.
