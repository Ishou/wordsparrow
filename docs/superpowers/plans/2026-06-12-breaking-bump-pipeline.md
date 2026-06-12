# Breaking-bump Pipeline — Plan 3: the A/B/C/D pipeline workflow (`on: issues`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the multi-agent pipeline *run* itself — `.github/workflows/breaking-bump.yml`, triggered `on: issues` by the spine issue Plan 2's dispatcher creates. One workflow run with the four agents (A doc gatherer, B planner, C plan reviewer, D implementer) as `needs:`-chained `claude-code-action` jobs; the B↔C refinement loop statically unrolled to ≤6 rounds; a top-level `if: failure()` escalation catch; the per-agent prompts under `.github/breaking-bump/prompts/`; and a stub-agent plumbing harness that exercises the whole chain (issue → A → B↔C → D → PR → auto-close) in CI with no real LLM.

**Architecture:** The spine issue is the pipeline's durable home and the source of context (Plan 1's `render_context_block`/`parse_context_block`; the body carries `dep`/`from`/`to`/`pr`). The run reads that context once into job outputs, then each agent is a fresh, hard-context-isolated `claude-code-action` job. State threads between jobs as `actions/upload-artifact`/`download-artifact` (`abschema.json`, `plan.json`, `findings.json`). GitHub Actions has **no native loop**, so the B↔C cycle is **statically unrolled** into 6 `(B_n, C_n)` pairs (12 jobs) chained by `needs:`, each guarded by an `if:` that short-circuits once a prior C approved or the loop terminated. All deterministic decisions (does C approve? are findings identical to last round? is `(a)+(b)` empty? did A fetch zero docs?) live in tested Python under `scripts/breaking-bump/` (Plan 1 bedrock + new `loop.py`, `abparse.py` helpers); the YAML stays thin and shells to them, mirroring `helm-bump-enrich.yml` and `claude-code-review.yml`. The stub-agent harness swaps each `claude-code-action` step for a fixture-emitting bash step behind a `BREAKING_BUMP_STUB` switch, so the orchestration is testable without tokens (spec #10).

**Tech Stack:** Python 3.14 + pytest + jsonschema + hypothesis + pyyaml (matches `scripts/breaking-bump/` + `breaking-bump-tests.yml`); GitHub Actions + `anthropics/claude-code-action@v1` (tag, matching repo convention), `actions/{checkout,setup-python,upload-artifact,download-artifact}` (SHA-pinned); `gh` CLI; `CLAUDE_CODE_OAUTH_TOKEN` + `CLAUDE_BOT_PAT` (workflow-scope, for Agent D's fork/PR + possible `.github/workflows/**` edits).

**Source spec:** `docs/superpowers/specs/2026-06-11-renovate-bump-supervisor-design.md`. Read it before starting — this plan implements its **Architecture** diagram (Agents A/B/C/D), the **Agent contracts** (A/B/C/D), the **Revised arrangement: the GH issue is the pipeline spine**, **Per-job invocation**, **Loop mechanics — SETTLED**, **B's output is CATEGORIZED**, and resolved OPEN QUESTIONS #3 (A→B schema), #4 (B↔C loop), #5 (ascending ratings), #6 (D fork/close + escalation), #9 (error handling / `if: failure()`), #10 (stub-agent testing), #11 (issue-event trigger + concurrency).

**Depends on (already on `main` / in-flight via Plans 1–2):**
- `scripts/breaking-bump/issue.py` — `render_context_block`, `parse_context_block`, `issue_title`, `find_existing`.
- `scripts/breaking-bump/identity.py` — `identity`, `slug`, `claude_branch` (returns `chore/claude-<dep>-v<to>`).
- `scripts/breaking-bump/schema.py` + `schema/ab_contract.schema.json` — `validate`, `is_valid` for the A→B contract.
- `scripts/breaking-bump/routing.py` — route constants + `parse_semver`.
- Plan 2: the labels (`ai-driven`, `breaking-bump`, `post-bump-enhancement`, `needs-human`, `ai-cleared`), `breaking-bump-dispatch.yml` (creates the spine issue with the context block + `ai-driven`+`breaking-bump` labels), `breaking-bump-tests.yml` (globs `scripts/breaking-bump/**` — new `test_*.py` run automatically).

**Scope boundary — NOT in this plan:** Step 0 dispatcher, the AI gate, labels bootstrap, §6a suppression, `renovate.json` (all Plan 2). `helm-bump-enrich.yml` retirement and the live signoz / helm-v4 runs (a later wave). This plan starts the moment a `breaking-bump`-labelled issue is *opened* and ends when Agent D's claude PR is open + handed to the existing §6a cycle (which `claude-code-review.yml` already runs on `claude/*` / `chore/claude-*` branches).

---

## ADR pre-read (do this first, once)

This plan touches `.github/workflows/`, `.github/breaking-bump/prompts/`, and `scripts/breaking-bump/`. Run:

```bash
scripts/adr-context.sh .github/workflows/breaking-bump.yml scripts/breaking-bump/loop.py .github/breaking-bump/prompts/agent-a.md
```

Read every ADR it emits in full before writing code (per CLAUDE.md). Landmarks: ADR-0068 (this pipeline — already merged; it registers `.github/workflows/breaking-bump-*.yml`, `scripts/breaking-bump/**`, and `.github/breaking-bump/prompts/**`, so **no new ADR and no INDEX.md edit are needed**), ADR-0001 (workflow, §6a, 400-line cap), ADR-0067 (helm-enrich, superseded — the `claude-code-action` invocation model for Agent A).

## Local prerequisite

CI's `setup-python` provides `python`. On macOS the binary is `python3`. First: `pip install -r scripts/breaking-bump/requirements.txt` (pytest + jsonschema + hypothesis + pyyaml — already pinned).

## Deployment preconditions (document, do not implement)

- **`CLAUDE_BOT_PAT` provisioned with `workflows` scope** is a hard precondition for Agent D (Wave 4). When the bumped dep is `claude-code-action`/`actions/*`, D's migration edits `.github/workflows/**`; the default `GITHUB_TOKEN` cannot push workflow-file edits (see `claude-code-review.yml` checkout comment). D's checkout/fork uses `CLAUDE_BOT_PAT || GITHUB_TOKEN`. Flag this in the Wave-4 PR body.
- **`CLAUDE_CODE_OAUTH_TOKEN`** already provisioned (used by `claude-code-review.yml`, `helm-bump-enrich.yml`). All A/B/C/D jobs reuse it.
- **The 5 labels exist** (Plan 2's `breaking-bump-labels` ran). D applies `post-bump-enhancement` (category c) and the failure-catch applies `needs-human`; both fail on a missing label.

---

## Execution model: waves of PRs

Five PR waves; each goes through its full review cycle (§6a + maintainer) and **merges before the next wave starts**, so review feedback reshapes what follows. Each wave is < 400 lines of hand-written diff (the unrolled B↔C loop in Wave 3 is the one that may invoke the standing cap-override — flagged there).

| Wave / PR | Title (one line) | Files | Why this order |
|---|---|---|---|
| **Wave 1** | loop-decision + A→B parse helpers (tested Python) | `scripts/breaking-bump/loop.py` (+test), `abparse.py` (+test) | Pure, unit-tested deterministic core the YAML shells to: "did C approve / is the loop done / are findings identical" + "extract the categorized B output + C verdict from agent files". No AI, no YAML — lands and is fully exercised first. |
| **Wave 2** | the four agent prompts | `.github/breaking-bump/prompts/{agent-a,agent-b,agent-c,agent-d}.md` | Versioned, reviewable prose. Independent of the YAML; lets the maintainer review agent mandates before any orchestration wiring. |
| **Wave 3** | the pipeline workflow: context read + A + B↔C unrolled loop | `.github/workflows/breaking-bump.yml` (new; A + 6 unrolled B/C rounds + failure-catch, **D stubbed as a no-op gate**) | The orchestration spine. Needs Waves 1–2. May exceed 400 lines (12 near-identical unrolled jobs) → cite the standing cap-override + the "N copies of the same line" rationale in the PR body. |
| **Wave 4** | Agent D job (fork/close/implement) | `.github/workflows/breaking-bump.yml` (replace the D stub with the real job) | The only repo-writing agent + the Renovate-PR fork/close. Bolts onto the Wave-3 `plan-approved` gate. Last real-agent wave because it is the irreversible side-effect (closes a Renovate PR). |
| **Wave 5** | stub-agent plumbing harness | `scripts/breaking-bump/stub_fixtures/*`, `.github/workflows/breaking-bump.yml` (add the `BREAKING_BUMP_STUB` switch + `workflow_dispatch` test mode), `scripts/breaking-bump/test_stub_chain.py` | End-to-end orchestration test with canned fixtures, no LLM (spec #10). Last because it must mirror the final shape of Waves 3–4. |

---

## File Structure

| File | Wave | New/Mod | Responsibility |
|---|---|---|---|
| `scripts/breaking-bump/loop.py` | 1 | New | `c_approved(verdict)`, `findings_identical(prev, curr)`, `loop_done(...)`, `round_should_run(...)` — the deterministic B↔C control logic. |
| `scripts/breaking-bump/test_loop.py` | 1 | New | Unit tests for `loop.py`. |
| `scripts/breaking-bump/abparse.py` | 1 | New | Parse agent output files: A's schema (validate via `schema.py`), B's categorized findings (`a`/`b`/`c`), C's `{approved, findings}` verdict; the `(a)+(b)-empty` early-exit predicate. |
| `scripts/breaking-bump/test_abparse.py` | 1 | New | Unit tests for `abparse.py`. |
| `.github/breaking-bump/prompts/agent-a.md` | 2 | New | Doc gatherer prompt — fetch docs, emit A→B schema, zero-doc tripwire. |
| `.github/breaking-bump/prompts/agent-b.md` | 2 | New | Planner prompt — rate A, read codebase, emit categorized plan. |
| `.github/breaking-bump/prompts/agent-c.md` | 2 | New | Plan reviewer prompt — rate B vs A's schema only, emit verdict. |
| `.github/breaking-bump/prompts/agent-d.md` | 2 | New | Implementer prompt — fork, open claude PR first, close Renovate PR, implement (a)+(b). |
| `.github/workflows/breaking-bump.yml` | 3 | New | The pipeline run: `on: issues`, context read, A, 6 unrolled B/C rounds, plan-approved gate, failure-catch. D stubbed. |
| `.github/workflows/breaking-bump.yml` | 4 | Mod | Replace the D stub with the real Agent D job. |
| `.github/workflows/breaking-bump.yml` | 5 | Mod | Add `BREAKING_BUMP_STUB` switch + `workflow_dispatch` test inputs. |
| `scripts/breaking-bump/stub_fixtures/abschema.json` | 5 | New | Canned A→B schema fixture (schema-valid). |
| `scripts/breaking-bump/stub_fixtures/plan.round1.json` | 5 | New | Canned B plan (round 1). |
| `scripts/breaking-bump/stub_fixtures/findings.round1.json` | 5 | New | Canned C verdict (round 1, approved). |
| `scripts/breaking-bump/test_stub_chain.py` | 5 | New | Asserts the stub fixtures satisfy the contracts the YAML consumes. |

`breaking-bump-tests.yml` already globs `scripts/breaking-bump/**`, so all new `test_*.py` run in CI with no workflow edit.

---

## Locked implementation decisions (where the spec left a choice)

1. **Context source = the issue body, read once into job outputs.** The `read-context` job (first in the run) checks out the repo, reads `github.event.issue.body`, and calls `issue.parse_context_block` to emit `dep`/`from`/`to`/`pr` as job outputs every downstream job consumes via `needs.read-context.outputs.*`. **Guard (spec #11):** if `parse_context_block` returns `None` (a stray `breaking-bump` label on a hand-made issue with no context block), `read-context` sets `valid=false` and every downstream job's `if:` requires `valid == 'true'` → the run no-ops. The job is also gated to `contains(github.event.issue.labels.*.name, 'breaking-bump')` at the workflow `if:`.

2. **State hand-off = JSON artifacts, one per agent output, round-suffixed.** A uploads `abschema` (the file `abschema.json`). Each `B_n` uploads `plan-round<n>` (`plan.json`); each `C_n` uploads `findings-round<n>` (`findings.json`). A round's B downloads A's schema + the *previous* round's findings (round 1's B downloads only the schema). Each C downloads the same-round plan + the schema. The final approved plan is whichever `plan-round<n>` the approving `C_n` blessed; D downloads `abschema` + that `plan-round<n>` (resolved by a deterministic `which-plan` step reading the per-round approval outputs). Artifact **names** are `abschema`, `plan-round1`…`plan-round6`, `findings-round1`…`findings-round6` — consistent across the unrolled jobs.

3. **The B↔C loop is statically unrolled to 6 rounds (12 jobs) with `if:` skip-on-approval guards.** GitHub Actions has no loop. Each round is two jobs `b_round<n>` and `c_round<n>`. `c_round<n>` exposes two outputs: `approved` (`true`/`false`) and `findings_sha` (a stable hash of its findings, for the identical-finding terminator). `b_round<n>`'s `if:` runs **only if** the loop is not yet done — concretely `needs.c_round<n-1>.outputs.approved == 'false' && needs.c_round<n-1>.outputs.terminated == 'false'` (round 1 runs whenever A produced a schema and B's rating of A was sufficient). The deterministic "is the loop done?" decision is computed by `loop.py` inside each C job and surfaced as the `approved`/`terminated` outputs, so the YAML `if:` is a pure boolean read — no logic in YAML. **`terminated`** fires when round N's findings hash == round N-1's (identical-finding terminator, spec #4) OR round 6 completes unapproved (cap). On any `terminated && !approved`, escalation is the failure-catch's job (the `plan-approved` gate sees no approval → the run ends with the spine issue gaining `needs-human`).

4. **Ratings are consumer-judged (spec #5), surfaced as deterministic outputs, never self-rated.** B's **first act** is to rate A (`sourceConfidence`-driven sufficiency): B writes `abrating.txt` (one of `high|medium|low|none`); a bash step reads it and if `low`/`none` sets `b_round1.outputs.gate_a_failed=true` → the `plan-approved` gate fails → failure-catch escalates (this *is* Gate A, consumer-judged). C rates B (completeness/grounding vs A's schema only) → `findings.json` + the `approved` boolean. §6a rates D downstream (unchanged, on the claude PR). A's *only* self-check is the deterministic zero-doc tripwire (it fetched zero usable sources → A writes `abschema.json` with `sourceConfidence: none` and empty `sources` → B reads it, rates `none`, Gate A escalates).

5. **B's output is categorized, parsed deterministically (spec "B's output is CATEGORIZED").** B emits `plan.json` with three keys `a` (mandatory migration), `b` (doc/ADR coherence), `c` (opportunistic refactor — surfaced as a separate `post-bump-enhancement` issue by D, never in D's PR). `abparse.early_exit(plan)` is `True` iff `a` and `b` are both empty → the run labels the spine issue `ai-cleared`, comments on the Renovate PR, auto-closes the issue, and **does not dispatch D** (the "let Renovate's PR merge" path). C still runs to bless even an empty plan; an approved-empty plan is the cleared path.

6. **D forks from the *Renovate branch tip*, looked up from the issue's PR# (spec #6 + #11).** The run is issue-triggered, not PR-triggered, so D has no `github.event.pull_request`. D reads `pr` from the context block, then `gh pr view <pr> --json headRefName,headRefOid` to get Renovate's branch + tip SHA. D forks `chore/claude-<dep>-v<to>` (via `identity.claude_branch`) from that tip, opens the claude PR **first** (body links Renovate PR #<pr>), confirms it exists, **then** `gh pr close <pr>` with a comment linking the claude PR. Idempotency: D first checks `gh pr list --head chore/claude-<dep>-v<to>` — if a claude PR already exists, it no-ops (synchronize/re-trigger guard, spec #9).

7. **Failure funnels to the spine issue via a top-level `if: failure()` catch job (spec #9).** A final job `escalate` with `needs: [<all agent jobs>]` and `if: failure()` adds `needs-human` to the spine issue and posts a comment naming the failed stage. This catches infra crashes (runner OOM, action 5xx) *and* the deliberate gate failures (Gate A, no convergence). Pre-D failure → the Renovate PR is untouched (nothing lost); post-D failure → the abandoned-claude-PR case, the issue is the durable tracker.

8. **Per-bump cost observability, not a budget (spec #13).** Each agent job appends its `claude-code-action` usage (if the action surfaces it) to the spine issue via the post-step comment. No hard budget; this is the "watch with eyes open" lever. Implemented as a one-line comment from each agent's "post to issue" step.

---

# Wave 1 — deterministic loop + parse helpers (tested Python)

## Task 1.1 — write `loop.py` tests (RED)

- [ ] Create `scripts/breaking-bump/test_loop.py`:

```python
"""Unit tests for loop — the deterministic B<->C control logic."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import loop  # noqa: E402

MAX_ROUNDS = 6


def test_c_approved_true_on_approved_verdict():
    assert loop.c_approved({"approved": True, "findings": []}) is True


def test_c_approved_false_on_rejection():
    assert loop.c_approved({"approved": False, "findings": ["x"]}) is False


def test_c_approved_false_on_missing_key():
    # Malformed verdict -> not approved (fail-safe: keep looping / escalate).
    assert loop.c_approved({}) is False


def test_findings_identical_true_on_same_set():
    assert loop.findings_identical(["a", "b"], ["b", "a"]) is True


def test_findings_identical_false_on_change():
    assert loop.findings_identical(["a"], ["a", "b"]) is False


def test_findings_identical_false_on_empty_prev():
    # Round 1 has no prior findings -> never an identical-finding stop.
    assert loop.findings_identical([], ["a"]) is False


def test_loop_done_when_approved():
    done, reason = loop.loop_done(approved=True, identical=False, round_no=2,
                                  max_rounds=MAX_ROUNDS)
    assert done is True
    assert reason == "approved"


def test_loop_done_when_identical_findings():
    done, reason = loop.loop_done(approved=False, identical=True, round_no=3,
                                  max_rounds=MAX_ROUNDS)
    assert done is True
    assert reason == "stuck"


def test_loop_done_at_cap():
    done, reason = loop.loop_done(approved=False, identical=False,
                                  round_no=MAX_ROUNDS, max_rounds=MAX_ROUNDS)
    assert done is True
    assert reason == "cap"


def test_loop_not_done_mid_run():
    done, reason = loop.loop_done(approved=False, identical=False, round_no=2,
                                  max_rounds=MAX_ROUNDS)
    assert done is False
    assert reason == ""


def test_round_should_run_round1_always():
    # Round 1 runs whenever Gate A passed; no prior C to consult.
    assert loop.round_should_run(prev_approved=None, prev_terminated=None) is True


def test_round_should_run_false_after_approval():
    assert loop.round_should_run(prev_approved=True, prev_terminated=False) is False


def test_round_should_run_false_after_termination():
    assert loop.round_should_run(prev_approved=False, prev_terminated=True) is False


def test_round_should_run_true_when_unresolved():
    assert loop.round_should_run(prev_approved=False, prev_terminated=False) is True
```

- [ ] Run, see it fail (`ModuleNotFoundError: No module named 'loop'`):

```bash
cd scripts/breaking-bump && python -m pytest test_loop.py -v
```

## Task 1.2 — implement `loop.py` (GREEN)

- [ ] Create `scripts/breaking-bump/loop.py`:

```python
"""Deterministic B<->C loop control: approval, identical-finding stop, cap."""
from __future__ import annotations


def c_approved(verdict: dict) -> bool:
    """True iff C's verdict approves the plan; malformed verdict is not approved."""
    return bool(verdict.get("approved") is True)


def findings_identical(prev: list[str], curr: list[str]) -> bool:
    """True iff this round's findings match the previous round's (order-insensitive).

    An empty `prev` (round 1, or no prior findings) is never identical.
    """
    if not prev:
        return False
    return set(prev) == set(curr)


def loop_done(approved: bool, identical: bool, round_no: int,
              max_rounds: int) -> tuple[bool, str]:
    """Decide whether the B<->C loop terminates, and why.

    Returns (done, reason) with reason in {approved, stuck, cap, ""}.
    """
    if approved:
        return True, "approved"
    if identical:
        return True, "stuck"
    if round_no >= max_rounds:
        return True, "cap"
    return False, ""


def round_should_run(prev_approved: bool | None,
                     prev_terminated: bool | None) -> bool:
    """Whether round N's B job should run, given round N-1's C outcome.

    Round 1 (prev_* is None) always runs once Gate A has passed.
    Later rounds run only if the prior round neither approved nor terminated.
    """
    if prev_approved is None and prev_terminated is None:
        return True
    return not (bool(prev_approved) or bool(prev_terminated))
```

- [ ] Run, see it pass (`14 passed`):

```bash
cd scripts/breaking-bump && python -m pytest test_loop.py -v
```

## Task 1.3 — write `abparse.py` tests (RED)

- [ ] Create `scripts/breaking-bump/test_abparse.py`:

```python
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
    "sources": [{"url": "https://x/notes", "type": "changelog", "fetchedOk": True}],
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
    assert errors  # missing required key surfaces an error


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
```

- [ ] Run, see it fail:

```bash
cd scripts/breaking-bump && python -m pytest test_abparse.py -v
```

## Task 1.4 — implement `abparse.py` (GREEN)

- [ ] Create `scripts/breaking-bump/abparse.py`:

```python
"""Read A/B/C agent output files into deterministic orchestration decisions."""
from __future__ import annotations

import json
from pathlib import Path

import schema as ab_schema


def _load_json(path: str | Path) -> dict | None:
    try:
        return json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError):
        return None


def load_schema(path: str | Path) -> tuple[dict, list[str]]:
    """Load A's output; return (doc, validation_errors). Missing/bad file -> error."""
    doc = _load_json(path)
    if doc is None:
        return {}, ["abschema.json missing or not valid JSON"]
    return doc, ab_schema.validate(doc)


def zero_docs(doc: dict) -> bool:
    """A's deterministic tripwire: no usable source actually fetched."""
    sources = doc.get("sources") or []
    return not any(s.get("fetchedOk") for s in sources)


def early_exit(plan: dict) -> bool:
    """The '(a)+(b)-empty -> let Renovate's PR merge' predicate."""
    return not (plan.get("a") or plan.get("b"))


def load_verdict(path: str | Path) -> dict:
    """Load C's verdict; a missing/bad file is read as NOT approved (fail-safe)."""
    doc = _load_json(path)
    if doc is None or "approved" not in doc:
        return {"approved": False, "findings": []}
    return {"approved": bool(doc["approved"]), "findings": list(doc.get("findings") or [])}


def finding_keys(verdict: dict) -> list[str]:
    """Sorted findings list, for the identical-finding terminator's stable hash."""
    return sorted(str(f) for f in (verdict.get("findings") or []))
```

- [ ] Run, see it pass (`12 passed`), then the whole package:

```bash
cd scripts/breaking-bump && python -m pytest test_abparse.py -v && python -m pytest -v
```

Expected: all Plan-1/2 tests + the new `loop`/`abparse` tests pass.

## Task 1.5 — commit Wave 1

- [ ] Stage and commit:

```bash
git add scripts/breaking-bump/loop.py scripts/breaking-bump/test_loop.py \
        scripts/breaking-bump/abparse.py scripts/breaking-bump/test_abparse.py
git commit -s -m "feat(breaking-bump): add b-c loop control and agent-output parsers"
```

(Subject 64 chars, lowercase-led, type `feat`, ASCII ✓.)

---

# Wave 2 — the four agent prompts

> All four are versioned files (spec "Per-job invocation": prompts live in `.github/breaking-bump/prompts/<agent>.md`, not inline in YAML). Each agent receives `DEP`/`FROM`/`TO`/`PR_NUMBER`/`ISSUE_NUMBER` from the workflow environment. Tool scoping is set in the YAML (Waves 3–4), but each prompt restates its boundary so the contract is legible.

## Task 2.1 — Agent A prompt (doc gatherer)

- [ ] Create `.github/breaking-bump/prompts/agent-a.md`:

```markdown
# Agent A — doc gatherer (breaking-bump, ADR-0068)

You are **Agent A**, the doc gatherer for a supervised breaking dependency bump.
You **NEVER read this repository's code.** Your sole job is to fetch the official
upstream documentation for the version transition and emit a strictly
project-agnostic, grounded contract for Agent B.

## Context (from the environment)
- Dependency: `$DEP`
- Version: `$FROM` -> `$TO`
- Renovate PR: #$PR_NUMBER (its body holds the changelog/release links Renovate
  gathered).
- Spine issue: #$ISSUE_NUMBER (post your human-readable enrichment here).

## Sourcing order (reactive, grounded — never from memory)
1. Read the Renovate PR body: `gh pr view "$PR_NUMBER" --json body --jq .body`.
   It usually links the release notes / changelog for the range.
2. WebFetch those links. When `$FROM` -> `$TO` spans multiple releases, also
   fetch the intermediate releases (strip any `/tag/<v>` suffix to get the
   releases listing) so the whole range is covered, not just `$TO`.
3. WebSearch for a dedicated migration / upgrade / breaking-changes guide for
   this exact transition, and probe for an `llms.txt`-style AI-migration doc.
4. Consult `infra/tools-upgrade-sources.yaml` for a verified override entry for
   `$DEP`. Use it if present. Do **NOT** speculatively invent URLs — hand-authored
   URLs rot/404. If every fetch fails, that is a real signal (see the tripwire).

## Hard rules
- **Strictly project-agnostic.** Describe ONLY the upstream change. Zero
  references to our files, modules, or config — any project mapping is Agent B's
  job; you attempting it is hallucination.
- **Every claim cites a `sourceUrl`.** A breaking change / deprecation / removal
  / migration step with no `sourceUrl` is invalid output.
- **`detail` is a VERBATIM quote** from the fetched page; `summary` is your
  one-line handle. You locate + quote; you do not paraphrase or interpret.

## Output — write the A->B schema to /tmp/abschema.json (Write tool)
Emit JSON conforming to `scripts/breaking-bump/schema/ab_contract.schema.json`:

    {
      "dep": "$DEP", "from": "$FROM", "to": "$TO",
      "sourceConfidence": "high|medium|low|none",
      "sources": [{"url": "...", "type": "changelog|migration-guide|llms-txt|release", "fetchedOk": true}],
      "breakingChanges": [{"summary": "...", "detail": "<verbatim quote>", "sourceUrl": "..."}],
      "deprecations":    [{"summary": "...", "detail": "<verbatim quote>", "sourceUrl": "..."}],
      "removals":        [{"summary": "...", "detail": "<verbatim quote>", "sourceUrl": "..."}],
      "migrationSteps":  [{"instruction": "<verbatim quote>", "sourceUrl": "..."}]
    }

Rate `sourceConfidence` by evidence (not feeling):
- `high` — a dedicated migration/upgrade guide for this exact transition fetched
  200, breaking changes spelled out.
- `medium` — changelog/release notes enumerate changes, no dedicated guide.
- `low` — only thin/ambiguous sources (release page, partial 404s).
- `none` — no usable source fetched.

## Deterministic tripwire (your ONLY self-check)
If you fetched **zero usable sources**, still write a schema-valid file with
`"sourceConfidence": "none"`, `"sources": []` (or every entry `fetchedOk: false`),
and empty change lists. Do not invent content. The workflow reads this as Gate A.

## Also post a human-readable rendering to the spine issue
`gh issue comment "$ISSUE_NUMBER"` with a concise Markdown summary of the
migration-relevant changes (cite each source URL). This is the durable log;
the JSON file is the machine contract.
```

## Task 2.2 — Agent B prompt (planner)

- [ ] Create `.github/breaking-bump/prompts/agent-b.md`:

```markdown
# Agent B — planner (breaking-bump, ADR-0068)

You are **Agent B**, the planner. You read Agent A's schema as *data* and you
read THIS repository's code, then produce a categorized migration plan. You are
the first independent consumer of A's work, so you also **rate A**.

## Inputs
- `./abschema.json` — Agent A's A->B contract (read it first).
- `./prev-findings.json` — present from round 2 onward: Agent C's findings on
  your previous plan. Address each. Absent in round 1.
- Context: `$DEP` `$FROM` -> `$TO`, spine issue #$ISSUE_NUMBER.

## Step 1 — rate A (sufficiency-to-plan), FIRST
Read `abschema.json`'s `sourceConfidence` and content. Write ONE word to
`/tmp/abrating.txt` (Write tool): `high|medium|low|none`. This is consumer-judged
Gate A: if you genuinely cannot plan from A's context (sources too thin /
`none`), write `low` or `none` and STOP — do not fabricate a plan. The workflow
escalates (`needs-human`). Only continue to Step 2 when you rate `high`/`medium`.

## Step 2 — read the actual code before asserting impact
For each breaking change / removal / migration step in `abschema.json`, search
this repo (Grep/Glob/Read) for real usages. **Never claim our code uses a
changed API without reading the file.** This is the downstream grounding axis —
where planners hallucinate most. If nothing in our repo uses the changed
surface, that change is out of scope for us.

## Step 3 — emit the categorized plan to /tmp/plan.json (Write tool)
    {
      "a": ["<mandatory migration step grounded in a real file path>", ...],
      "b": ["<doc/ADR/comment that references the old version/behaviour>", ...],
      "c": ["<opportunistic refactor the new version enables, NOT forced>", ...]
    }
- **(a) mandatory migration** — breaking changes touching code/config we
  actually use. Each item names the real file(s). Goes into D's PR.
- **(b) doc/ADR coherence** — stale docs/ADRs/comments referencing the old
  version or behaviour ("registries cannot lag"). Bounded to THIS dep, not
  open-ended doc-gardening. Also goes into D's PR.
- **(c) opportunistic refactor** — high-reward but not forced. NOT in the bump
  PR; D opens a separate `post-bump-enhancement` issue. The human decides later.

If `a` and `b` are both empty, that is the legitimate "let Renovate's PR merge"
early-exit — emit the empty arrays honestly; do not manufacture work.

## Address C's findings (round 2+)
If `./prev-findings.json` exists, revise your plan to resolve every finding, then
re-emit `/tmp/plan.json`. If you genuinely disagree with a finding, keep your
position but say why in your issue comment.

## Post to the spine issue
`gh issue comment "$ISSUE_NUMBER"` with this round's plan summary (human log).
```

## Task 2.3 — Agent C prompt (plan reviewer)

- [ ] Create `.github/breaking-bump/prompts/agent-c.md`:

```markdown
# Agent C — plan reviewer (breaking-bump, ADR-0068)

You are **Agent C**, a fresh-context reviewer of Agent B's plan. You rate B for
**completeness + grounding vs Agent A's schema ONLY**. You are NOT a code-quality
reviewer — that is §6a's job on Agent D's diff later. Stay in your lane or you
become ceremony.

## Inputs
- `./abschema.json` — Agent A's contract (the ground truth for completeness).
- `./plan.json` — Agent B's plan this round.
- Context: `$DEP` `$FROM` -> `$TO`, spine issue #$ISSUE_NUMBER.

## Your two questions ONLY
1. **Completeness:** does B's plan cover every breaking change / removal /
   migration step in `abschema.json` that plausibly affects a consumer? Flag any
   A-item with no corresponding plan entry and no explicit "not used here"
   justification.
2. **Grounding:** does each plan step in `(a)`/`(b)` reference a real file/path?
   Flag steps that assert impact without naming a concrete target (B was told to
   read the file first; an ungrounded step is a likely hallucination).

Do **NOT** flag: code style, naming, whether the migration is "elegant", or
anything about how D will implement it. An empty `(a)+(b)` plan is VALID if
`abschema.json` shows nothing affects us — approve it (the cleared path).

## Output — write the verdict to /tmp/findings.json (Write tool)
    { "approved": true|false, "findings": ["<one finding string>", ...] }
- `approved: true` with `findings: []` when the plan is complete + grounded
  (including the legitimately-empty plan).
- `approved: false` with one string per finding otherwise. Keep finding strings
  STABLE in wording round-to-round when the underlying issue is unchanged — the
  workflow detects an identical-findings stall and escalates rather than looping
  forever.

## Post to the spine issue
`gh issue comment "$ISSUE_NUMBER"` with your verdict + findings (human log).
```

## Task 2.4 — Agent D prompt (implementer)

- [ ] Create `.github/breaking-bump/prompts/agent-d.md`:

```markdown
# Agent D — implementer (breaking-bump, ADR-0068)

You are **Agent D**, the implementer. The B<->C loop approved a plan. You open a
claude-owned PR from Renovate's branch tip, then close the Renovate PR, then
implement the approved plan's `(a)` + `(b)` items. **Order is failure-safe: open
the claude PR FIRST, confirm it is real, ONLY THEN close the Renovate PR.**

## Inputs
- `./abschema.json` — Agent A's contract.
- `./plan.json` — the approved plan (`a`/`b`/`c` arrays).
- Context: `$DEP` `$FROM` -> `$TO`, Renovate PR #$PR_NUMBER, spine issue
  #$ISSUE_NUMBER, target branch `$CLAUDE_BRANCH` (`chore/claude-<dep>-v<to>`).

## Step 1 — branch is already checked out; do NOT re-fork
The workflow's `rev` step has already performed the idempotency check, fetched
Renovate's branch, and run `git checkout -b "$CLAUDE_BRANCH" "$REN_OID"`. You are
ALREADY on `$CLAUDE_BRANCH` at Renovate's tip. Do NOT run `git checkout -b` or
re-examine `gh pr list --head` — the branch exists and is checked out.

## Step 2 — implement (a) + (b) from plan.json
Apply every `(a)` mandatory-migration and `(b)` doc/ADR-coherence item. Do NOT
implement `(c)` — those become a separate `post-bump-enhancement` issue (Step 5).
Run the relevant verification for what you touched (`./gradlew build`, or
`cd frontend && pnpm typecheck && pnpm test && pnpm build`, or doc-only = read
the diff). Fix causes, never work around. Commit with conventional messages,
`git commit -s` (DCO), bounded-context scope.

## Step 3 — push + open the claude PR FIRST
`git push -u origin "$CLAUDE_BRANCH"`, then `gh pr create` with a body that
links the Renovate PR (`Migrates the bump from #$PR_NUMBER`) and `Closes
#$ISSUE_NUMBER` so a merge auto-closes the spine issue. Confirm the PR exists
(`gh pr view`) before Step 4.

## Step 4 — ONLY NOW close the Renovate PR
`gh pr close "$PR_NUMBER" --comment "Superseded by the claude migration PR
<claude-pr-url>; this version is being migrated on a claude-owned branch."`
Closing it makes Renovate treat the version as ignored (it will not re-propose
it) — that is intended.

## Step 5 — surface category (c), if any
For each `(c)` item, `gh issue create --label ai-driven --label
post-bump-enhancement` linking the bump. No automated workflow follows; the
human decides.

## Constraints
- Never force-push. Never push to `main`. Never `--no-verify` / `--no-gpg-sign`.
- The claude PR is a normal PR: the existing §6a cycle reviews your code (it is
  suppressed on `renovate/*` but runs on `chore/claude-*`). Do not re-run review
  yourself.
```

## Task 2.5 — commit Wave 2

- [ ] Validate the prompt directory and commit:

```bash
ls .github/breaking-bump/prompts/
git add .github/breaking-bump/prompts/agent-a.md \
        .github/breaking-bump/prompts/agent-b.md \
        .github/breaking-bump/prompts/agent-c.md \
        .github/breaking-bump/prompts/agent-d.md
git commit -s -m "feat(breaking-bump): add a/b/c/d agent prompts for the pipeline"
```

(Subject 62 chars, lowercase-led, type `feat`, ASCII ✓.)

---

# Wave 3 — the pipeline workflow (`on: issues`): context + A + B↔C loop

> **Cap note:** this single workflow file contains the `read-context` job, Agent
> A, **six unrolled B/C round-pairs (12 jobs)**, a `plan-approved` gate, the
> `escalate` failure-catch, and a D **stub**. The unrolled jobs are 6 near-identical
> copies — exactly the "N copies of the same line" shape the standing cap-override
> covers. The Wave-3 PR body must cite the ADR-0001 §4 2026-05-25 soft-target
> amendment + the standing maintainer cap-override and name this as a coherent
> single workstream (the loop is meaningless split across PRs).
>
> **No native loop in GH Actions** — the ≤6-round B↔C is statically unrolled.
> Each round is `b_round<n>` + `c_round<n>`. `b_round<n>` runs only if the prior
> round neither approved nor terminated (`loop.round_should_run`, surfaced as
> C's `approved`/`terminated` outputs). `c_round<n>` computes `loop.loop_done`
> and exposes `approved` + `terminated`. The `plan-approved` gate after round 6
> reads whichever round approved; if none did, it fails → `escalate` runs.

## Task 3.1 — write the workflow skeleton: triggers, context-read, Agent A

- [ ] Create `.github/workflows/breaking-bump.yml`. **Part 1** — header + the
`read-context` and `agent-a` jobs (the remaining jobs are appended in Tasks
3.2–3.5; build the file incrementally, validating YAML after each append):

```yaml
name: breaking-bump

# The breaking-bump migration pipeline (ADR-0068). Triggered by the spine issue
# Step 0 creates. One run; agents A/B/C/D are needs:-chained jobs. The B<->C
# plan-refinement loop is statically unrolled to <=6 rounds (no native loop in
# GH Actions). Deterministic decisions live in tested scripts/breaking-bump/*.py.

on:
  issues:
    # labeled-only: the dispatcher creates the issue WITH labels already applied,
    # so both opened+labeled would fire and run A/B/C agents twice (duplicate tokens
    # + comments). labeled is guaranteed to fire and carries the label name.
    types: [labeled]

concurrency:
  # Identity slug is not known until the body is parsed; issue-number keying
  # serialises this issue's opened+labeled events (the only re-fire source).
  # cancel-in-progress:false: never kill an in-flight migration.
  group: breaking-bump-issue-${{ github.event.issue.number }}
  cancel-in-progress: false

permissions:
  contents: write        # Agent D forks + pushes the claude branch
  pull-requests: write   # open the claude PR, close the Renovate PR
  issues: write          # post to + label the spine issue
  id-token: write

jobs:
  read-context:
    # Gate the whole run to spine issues carrying the breaking-bump label.
    if: contains(github.event.issue.labels.*.name, 'breaking-bump')
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      valid: ${{ steps.ctx.outputs.valid }}
      dep: ${{ steps.ctx.outputs.dep }}
      from: ${{ steps.ctx.outputs.from }}
      to: ${{ steps.ctx.outputs.to }}
      pr: ${{ steps.ctx.outputs.pr }}
      claude_branch: ${{ steps.ctx.outputs.claude_branch }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with:
          fetch-depth: 1
      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
        with:
          python-version: '3.14.6'
      - run: pip install -r scripts/breaking-bump/requirements.txt
      - name: Parse the context block from the issue body
        id: ctx
        env:
          ISSUE_BODY: ${{ github.event.issue.body }}
        run: |
          set -euo pipefail
          python - <<'PY'
          import os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import issue, identity
          ctx = issue.parse_context_block(os.environ.get("ISSUE_BODY", ""))
          out = open(os.environ["GITHUB_OUTPUT"], "a")
          if not ctx:
              # Stray breaking-bump label on a hand-made issue -> no-op the run.
              out.write("valid=false\n")
              sys.exit(0)
          dep, frm, to, pr = ctx["dep"], ctx["from"], ctx["to"], ctx["pr"]
          out.write("valid=true\n")
          out.write(f"dep={dep}\nfrom={frm}\nto={to}\npr={pr}\n")
          out.write(f"claude_branch={identity.claude_branch(dep, to)}\n")
          PY

  agent-a:
    needs: read-context
    if: needs.read-context.outputs.valid == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      DEP: ${{ needs.read-context.outputs.dep }}
      FROM: ${{ needs.read-context.outputs.from }}
      TO: ${{ needs.read-context.outputs.to }}
      PR_NUMBER: ${{ needs.read-context.outputs.pr }}
      ISSUE_NUMBER: ${{ github.event.issue.number }}
    outputs:
      gate_a_failed: ${{ steps.tripwire.outputs.gate_a_failed }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with:
          fetch-depth: 1
      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
        with:
          python-version: '3.14.6'
      - run: pip install -r scripts/breaking-bump/requirements.txt
      - name: Run Agent A (doc gatherer)
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          allowed_bots: 'renovate[bot],github-actions[bot]'
          # A NEVER reads our code: WebFetch/WebSearch + read the registry + post to the issue. No repo write.
          claude_args: '--allowed-tools "Read,Write,WebFetch,WebSearch,Bash(gh pr view:*),Bash(gh issue comment:*)"'
          prompt: |
            Read .github/breaking-bump/prompts/agent-a.md and follow it exactly.
            Substitute DEP=${{ env.DEP }}, FROM=${{ env.FROM }}, TO=${{ env.TO }},
            PR_NUMBER=${{ env.PR_NUMBER }}, ISSUE_NUMBER=${{ env.ISSUE_NUMBER }}.
            Write the A->B schema to /tmp/abschema.json and post a human-readable
            enrichment comment to the spine issue.
      - name: Validate schema + zero-doc tripwire
        id: tripwire
        run: |
          set -euo pipefail
          test -f /tmp/abschema.json || : > /tmp/abschema.json
          python - <<'PY'
          import os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import abparse
          doc, errors = abparse.load_schema("/tmp/abschema.json")
          gate_a = bool(errors) or abparse.zero_docs(doc)
          with open(os.environ["GITHUB_OUTPUT"], "a") as out:
              out.write(f"gate_a_failed={'true' if gate_a else 'false'}\n")
          if errors:
              print("::warning::A->B schema invalid: " + "; ".join(errors))
          PY
      - name: Upload A's schema
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: abschema
          path: /tmp/abschema.json
          retention-days: 3
      - name: Gate A — fail the run when A produced no usable contract
        if: steps.tripwire.outputs.gate_a_failed == 'true'
        run: |
          echo "::error::Gate A: Agent A fetched no usable docs (or emitted an invalid schema)."
          exit 1
```

- [ ] Validate the partial YAML parses:

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/breaking-bump.yml')); print('breaking-bump yaml OK (part 1)')"
```

## Task 3.2 — round 1 (`b_round1` + `c_round1`)

> Round 1 is special: `b_round1` runs whenever Gate A passed (no prior C), and it
> also carries the consumer-rated Gate A (B rates A's sufficiency). `c_round1`
> computes `loop_done` with `round_no=1`, `identical=false` (no prior findings).

- [ ] Append to `jobs:`:

```yaml
  b_round1:
    needs: [read-context, agent-a]
    if: needs.read-context.outputs.valid == 'true' && needs.agent-a.outputs.gate_a_failed == 'false'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      DEP: ${{ needs.read-context.outputs.dep }}
      FROM: ${{ needs.read-context.outputs.from }}
      TO: ${{ needs.read-context.outputs.to }}
      ISSUE_NUMBER: ${{ github.event.issue.number }}
    outputs:
      gate_a_failed: ${{ steps.rate.outputs.gate_a_failed }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with: { fetch-depth: 1 }
      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
        with: { python-version: '3.14.6' }
      - run: pip install -r scripts/breaking-bump/requirements.txt
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with: { name: abschema, path: . }
      - name: Run Agent B (planner) — round 1
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          allowed_bots: 'github-actions[bot]'
          # B reads our code + A's schema + posts to the issue. No repo write, no PR/branch ops.
          claude_args: '--allowed-tools "Read,Glob,Grep,Write,Bash(gh issue comment:*)"'
          prompt: |
            Read .github/breaking-bump/prompts/agent-b.md and follow it exactly.
            Substitute DEP=${{ env.DEP }}, FROM=${{ env.FROM }}, TO=${{ env.TO }},
            ISSUE_NUMBER=${{ env.ISSUE_NUMBER }}. A's schema is ./abschema.json
            (no ./prev-findings.json this round). First write /tmp/abrating.txt
            (rate A), then /tmp/plan.json (the categorized plan).
      - name: Consumer-rated Gate A (B rates A)
        id: rate
        run: |
          set -euo pipefail
          RATING="$(head -n1 /tmp/abrating.txt 2>/dev/null | tr -d '[:space:]' || true)"
          echo "B's rating of A: '${RATING:-<none>}'"
          case "$RATING" in
            high|medium) echo "gate_a_failed=false" >> "$GITHUB_OUTPUT" ;;
            *)           echo "gate_a_failed=true"  >> "$GITHUB_OUTPUT" ;;
          esac
      - name: Upload plan (round 1)
        if: steps.rate.outputs.gate_a_failed == 'false'
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with: { name: plan-round1, path: /tmp/plan.json, retention-days: 3 }
      - name: Gate A — B judged A insufficient
        if: steps.rate.outputs.gate_a_failed == 'true'
        run: |
          echo "::error::Gate A (consumer-judged): B rated A's context insufficient to plan."
          exit 1

  c_round1:
    needs: [read-context, b_round1]
    if: needs.read-context.outputs.valid == 'true' && needs.b_round1.outputs.gate_a_failed == 'false'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      DEP: ${{ needs.read-context.outputs.dep }}
      FROM: ${{ needs.read-context.outputs.from }}
      TO: ${{ needs.read-context.outputs.to }}
      ISSUE_NUMBER: ${{ github.event.issue.number }}
      ROUND_NO: '1'
    outputs:
      approved: ${{ steps.decide.outputs.approved }}
      terminated: ${{ steps.decide.outputs.terminated }}
      findings_hash: ${{ steps.decide.outputs.findings_hash }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with: { fetch-depth: 1 }
      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
        with: { python-version: '3.14.6' }
      - run: pip install -r scripts/breaking-bump/requirements.txt
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with: { name: abschema, path: . }
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with: { name: plan-round1, path: . }
      - name: Run Agent C (plan reviewer) — round 1
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          allowed_bots: 'github-actions[bot]'
          # C reads the plan + A's schema + the repo (to verify grounding), posts the verdict. No write.
          claude_args: '--allowed-tools "Read,Glob,Grep,Write,Bash(gh issue comment:*)"'
          prompt: |
            Read .github/breaking-bump/prompts/agent-c.md and follow it exactly.
            Substitute DEP=${{ env.DEP }}, FROM=${{ env.FROM }}, TO=${{ env.TO }},
            ISSUE_NUMBER=${{ env.ISSUE_NUMBER }}. Inputs: ./abschema.json,
            ./plan.json. Write the verdict to /tmp/findings.json.
      - name: Decide loop state (approved / terminated / hash)
        id: decide
        env:
          PREV_HASH: ''   # round 1 has no prior findings
        run: |
          set -euo pipefail
          test -f /tmp/findings.json || echo '{"approved":false,"findings":[]}' > /tmp/findings.json
          python - <<'PY'
          import hashlib, json, os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import abparse, loop
          verdict = abparse.load_verdict("/tmp/findings.json")
          keys = abparse.finding_keys(verdict)
          curr_hash = hashlib.sha256("\n".join(keys).encode()).hexdigest()
          prev_hash = os.environ.get("PREV_HASH", "")
          identical = bool(prev_hash) and prev_hash == curr_hash
          approved = loop.c_approved(verdict)
          done, _ = loop.loop_done(approved, identical, int(os.environ["ROUND_NO"]), 6)
          terminated = done and not approved
          out = open(os.environ["GITHUB_OUTPUT"], "a")
          out.write(f"approved={'true' if approved else 'false'}\n")
          out.write(f"terminated={'true' if terminated else 'false'}\n")
          out.write(f"findings_hash={curr_hash}\n")
          PY
      - name: Upload findings (round 1)
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with: { name: findings-round1, path: /tmp/findings.json, retention-days: 3 }
```

## Task 3.3 — rounds 2 through 6 (unrolled template)

> Rounds 2–6 are mechanically identical to round 1's B/C pair with three
> per-round substitutions. **Copy the `b_round1`/`c_round1` pair five times**,
> renaming `1`→`n` for `n` in `2,3,4,5,6`, and apply exactly these deltas (nothing
> else changes — this is the "N copies of the same line" the cap-override covers):

For each `n` in `{2,3,4,5,6}` (let `p = n-1`):

- [ ] **`b_round<n>`**:
  - `needs: [read-context, b_round1, c_round<p>]`
  - `if: needs.read-context.outputs.valid == 'true' && needs.c_round<p>.outputs.approved == 'false' && needs.c_round<p>.outputs.terminated == 'false'`
  - Remove the `outputs.gate_a_failed` block and the "Consumer-rated Gate A"/"Gate A" steps (Gate A only runs in round 1). The round-`n` B has no rating step.
  - Add a second `download-artifact` step **before** the agent step to fetch the prior round's findings as `./prev-findings.json`:
    ```yaml
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with: { name: findings-round<p>, path: /tmp/prevfindings }
      - name: Stage prior findings for Agent B
        run: cp /tmp/prevfindings/findings.json ./prev-findings.json
    ```
  - Agent B prompt: change "round 1" → "round `<n>`" and the note to "A's schema is ./abschema.json and Agent C's prior findings are ./prev-findings.json — address each."
  - "Upload plan" step: `if:` removed (no Gate A gate in later rounds), `name: plan-round<n>`.
- [ ] **`c_round<n>`**:
  - `needs: [read-context, b_round<n>, c_round<p>]`
  - `if: needs.read-context.outputs.valid == 'true' && needs.b_round<n>.result == 'success' && needs.c_round<p>.outputs.approved == 'false' && needs.c_round<p>.outputs.terminated == 'false'`
  - `env.ROUND_NO: '<n>'`
  - `env.PREV_HASH: ${{ needs.c_round<p>.outputs.findings_hash }}` on the "Decide loop state" step (this is what wires the identical-finding terminator across rounds).
  - download `name: plan-round<n>`; upload `name: findings-round<n>`.

- [ ] After writing all six pairs, validate the YAML and confirm 12 round jobs exist:

```bash
python -c "import yaml; d=yaml.safe_load(open('.github/workflows/breaking-bump.yml')); j=d['jobs']; assert all(f'b_round{n}' in j and f'c_round{n}' in j for n in range(1,7)), 'missing round jobs'; print('all 12 round jobs present')"
```

Expected: `all 12 round jobs present`.

## Task 3.4 — the `plan-approved` gate (which round won + early-exit/cleared path)

> After the loop, a deterministic job decides: did any round approve? Which
> round's plan is canonical? Is it the `(a)+(b)-empty` cleared path? It downloads
> the approved round's plan and re-uploads it under the stable name `plan-final`
> for D, and emits `dispatch_d` / `cleared` outputs.

- [ ] Append to `jobs:`:

```yaml
  plan-approved:
    needs: [read-context, c_round1, c_round2, c_round3, c_round4, c_round5, c_round6]
    # Run whenever the loop produced any C result (success OR skipped rounds); never on Gate-A failure.
    if: always() && needs.read-context.outputs.valid == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      DEP: ${{ needs.read-context.outputs.dep }}
      FROM: ${{ needs.read-context.outputs.from }}
      TO: ${{ needs.read-context.outputs.to }}
      PR_NUMBER: ${{ needs.read-context.outputs.pr }}
      ISSUE_NUMBER: ${{ github.event.issue.number }}
      # The per-round approval flags, threaded in so a single step picks the winner.
      APPROVED_1: ${{ needs.c_round1.outputs.approved }}
      APPROVED_2: ${{ needs.c_round2.outputs.approved }}
      APPROVED_3: ${{ needs.c_round3.outputs.approved }}
      APPROVED_4: ${{ needs.c_round4.outputs.approved }}
      APPROVED_5: ${{ needs.c_round5.outputs.approved }}
      APPROVED_6: ${{ needs.c_round6.outputs.approved }}
    outputs:
      winning_round: ${{ steps.pick.outputs.winning_round }}
      dispatch_d: ${{ steps.classify.outputs.dispatch_d }}
      cleared: ${{ steps.classify.outputs.cleared }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with: { fetch-depth: 1 }
      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
        with: { python-version: '3.14.6' }
      - run: pip install -r scripts/breaking-bump/requirements.txt
      - name: Pick the winning (approved) round
        id: pick
        run: |
          set -euo pipefail
          WIN=0
          for n in 1 2 3 4 5 6; do
            eval "v=\${APPROVED_$n:-}"
            if [ "$v" = "true" ]; then WIN=$n; break; fi
          done
          echo "winning_round=$WIN" >> "$GITHUB_OUTPUT"
          if [ "$WIN" = "0" ]; then
            # No round approved -> loop failed to converge. Fail so escalate runs.
            echo "::error::B<->C loop did not converge in 6 rounds."
            echo "dispatch_d=false" >> "$GITHUB_OUTPUT"
            echo "cleared=false" >> "$GITHUB_OUTPUT"
            exit 1
          fi
      - name: Download the approved plan
        if: steps.pick.outputs.winning_round != '0'
        uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: plan-round${{ steps.pick.outputs.winning_round }}
          path: .
      - name: Classify approved plan (cleared early-exit vs dispatch D)
        if: steps.pick.outputs.winning_round != '0'
        id: classify
        run: |
          set -euo pipefail
          python - <<'PY'
          import json, os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import abparse
          plan = json.load(open("plan.json"))
          cleared = abparse.early_exit(plan)
          out = open(os.environ["GITHUB_OUTPUT"], "a")
          out.write(f"cleared={'true' if cleared else 'false'}\n")
          out.write(f"dispatch_d={'false' if cleared else 'true'}\n")
          PY
      - name: Re-publish the approved plan as plan-final (for Agent D)
        if: steps.classify.outputs.dispatch_d == 'true'
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with: { name: plan-final, path: plan.json, retention-days: 3 }
      - name: Cleared path — stamp ai-cleared + comment Renovate PR + close issue
        if: steps.classify.outputs.cleared == 'true'
        run: |
          set -euo pipefail
          gh issue edit "$ISSUE_NUMBER" --add-label ai-cleared
          gh pr comment "$PR_NUMBER" --body \
            "breaking-bump reviewed \`$DEP\` \`$FROM\` -> \`$TO\` — no migration needed, safe to merge."
          gh issue close "$ISSUE_NUMBER" --comment \
            "Cleared by the breaking-bump pipeline: no mandatory migration or doc-coherence changes. Renovate PR #$PR_NUMBER is safe to merge."
```

> **`dispatch_d` / `cleared` propagation:** the **`classify`** step writes
> `dispatch_d` and `cleared` to `$GITHUB_OUTPUT` on the converged path, so the
> job declares those two outputs against `steps.classify.outputs.*` (step outputs
> are namespaced per step `id` — there is no "last write across steps wins").
> `winning_round` comes from the `pick` step. On the no-converge path `pick`
> `exit 1`s before `classify` runs → the job fails, `classify` is skipped, the
> `dispatch_d` output resolves empty (≠ `'true'`) so D is skipped, and `escalate`
> fires via `contains(needs.*.result, 'failure')`.

## Task 3.5 — D stub + the `escalate` failure-catch

- [ ] Append to `jobs:` — a **placeholder D** (Wave 4 replaces it) and the
failure-catch:

```yaml
  agent-d:
    needs: [read-context, plan-approved]
    if: needs.plan-approved.outputs.dispatch_d == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Agent D — PLACEHOLDER (real implementer lands in Wave 4)
        run: echo "::notice::plan approved; Agent D (fork/close/implement) lands in Wave 4."

  escalate:
    # Top-level failure-catch (spec #9): any failed job -> label the spine issue
    # needs-human and comment. Catches Gate A, no-convergence, AND infra crashes.
    needs: [read-context, agent-a, b_round1, c_round1, b_round2, c_round2,
            b_round3, c_round3, b_round4, c_round4, b_round5, c_round5,
            b_round6, c_round6, plan-approved, agent-d]
    if: always() && needs.read-context.outputs.valid == 'true' && contains(needs.*.result, 'failure')
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      ISSUE_NUMBER: ${{ github.event.issue.number }}
      RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
    steps:
      - name: Escalate to the spine issue
        run: |
          set -euo pipefail
          gh issue edit "$ISSUE_NUMBER" --add-label needs-human
          gh issue comment "$ISSUE_NUMBER" --body \
            "The breaking-bump pipeline failed and needs a human. Run: $RUN_URL

          A pre-D failure leaves the Renovate PR open (nothing lost). A post-D
          failure leaves the claude PR open for manual takeover. See the run log
          for the failed stage."
```

- [ ] Validate the complete Wave-3 file:

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/breaking-bump.yml')); print('breaking-bump yaml OK (full Wave 3)')"
```

Expected: `breaking-bump yaml OK (full Wave 3)`.

- [ ] Sanity-check the embedded Python imports resolve:

```bash
cd scripts/breaking-bump && python -c "import issue, identity, abparse, loop, schema, routing; print('imports OK')"
```

Expected: `imports OK`.

## Task 3.6 — commit Wave 3

```bash
git add .github/workflows/breaking-bump.yml
git commit -s -m "feat(ci): add breaking-bump pipeline run with unrolled b-c loop"
```

(Subject 63 chars, lowercase-led, type `ci`-scoped `feat`, ASCII ✓.)

> **Wave-3 PR body must:** (1) cite the ADR-0001 §4 2026-05-25 soft-target cap
> override + the standing maintainer authorization, naming this a single coherent
> workstream (the 12 unrolled jobs are N copies of one shape; splitting the loop
> across PRs is meaningless); (2) note Agent D is a placeholder this wave —
> a cleared (empty-plan) bump exercises the full A→B↔C→cleared path with no D, so
> the orchestration is testable now; (3) restate the `CLAUDE_BOT_PAT` precondition
> for Wave 4.

---

# Wave 4 — Agent D (fork / open-PR-first / close Renovate / implement)

## Task 4.1 — replace the D placeholder with the real implementer job

- [ ] Edit `.github/workflows/breaking-bump.yml`. **Delete** the placeholder
`agent-d` job from Wave 3:

```yaml
  agent-d:
    needs: [read-context, plan-approved]
    if: needs.plan-approved.outputs.dispatch_d == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Agent D — PLACEHOLDER (real implementer lands in Wave 4)
        run: echo "::notice::plan approved; Agent D (fork/close/implement) lands in Wave 4."
```

- [ ] Replace it with the real job (the `escalate` job's `needs:` already lists
`agent-d`, so no change there):

```yaml
  agent-d:
    needs: [read-context, plan-approved]
    if: needs.plan-approved.outputs.dispatch_d == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      DEP: ${{ needs.read-context.outputs.dep }}
      FROM: ${{ needs.read-context.outputs.from }}
      TO: ${{ needs.read-context.outputs.to }}
      PR_NUMBER: ${{ needs.read-context.outputs.pr }}
      ISSUE_NUMBER: ${{ github.event.issue.number }}
      CLAUDE_BRANCH: ${{ needs.read-context.outputs.claude_branch }}
    steps:
      # CLAUDE_BOT_PAT carries the `workflows` scope GITHUB_TOKEN lacks — required
      # when D's migration edits .github/workflows/** (e.g. an actions/* bump).
      # fetch-depth: 0 so D can fork from Renovate's tip SHA (not just main).
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with:
          fetch-depth: 0
          token: ${{ secrets.CLAUDE_BOT_PAT || secrets.GITHUB_TOKEN }}
      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
        with: { python-version: '3.14.6' }
      - run: pip install -r scripts/breaking-bump/requirements.txt
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with: { name: abschema, path: . }
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with: { name: plan-final, path: . }
      - name: Configure git identity
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
      - name: Resolve Renovate branch tip + idempotency guard
        id: rev
        env:
          GH_TOKEN: ${{ secrets.CLAUDE_BOT_PAT || secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          # Idempotency: a prior run may already have forked.
          EXISTING=$(gh pr list --head "$CLAUDE_BRANCH" --state open --json number --jq 'length')
          if [ "${EXISTING:-0}" != "0" ]; then
            echo "::notice::claude PR already exists for $CLAUDE_BRANCH; no-op."
            echo "skip=true" >> "$GITHUB_OUTPUT"; exit 0
          fi
          REN_REF=$(gh pr view "$PR_NUMBER" --json headRefName --jq .headRefName)
          REN_OID=$(gh pr view "$PR_NUMBER" --json headRefOid --jq .headRefOid)
          git fetch origin "$REN_REF"
          git checkout -b "$CLAUDE_BRANCH" "$REN_OID"
          echo "skip=false" >> "$GITHUB_OUTPUT"
          echo "ren_ref=$REN_REF" >> "$GITHUB_OUTPUT"
      - name: Run Agent D (implementer)
        if: steps.rev.outputs.skip == 'false'
        uses: anthropics/claude-code-action@v1
        env:
          GH_TOKEN: ${{ secrets.CLAUDE_BOT_PAT || secrets.GITHUB_TOKEN }}
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          allowed_bots: 'github-actions[bot],renovate[bot]'
          additional_permissions: |
            actions: read
          # D writes code, runs builds, git push, opens the claude PR, closes the Renovate PR, files (c) issues.
          claude_args: >-
            --allowed-tools "Read,Glob,Grep,Edit,Write,Bash(git:*),Bash(gh pr create:*),Bash(gh pr view:*),Bash(gh pr list:*),Bash(gh pr close:*),Bash(gh pr comment:*),Bash(gh issue create:*),Bash(gh issue comment:*),Bash(pnpm:*),Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(./gradlew:*),Bash(gradle:*),Bash(cat:*),Bash(ls:*),Bash(test:*)"
          prompt: |
            Read .github/breaking-bump/prompts/agent-d.md and follow it exactly.
            Substitute DEP=${{ env.DEP }}, FROM=${{ env.FROM }}, TO=${{ env.TO }},
            PR_NUMBER=${{ env.PR_NUMBER }}, ISSUE_NUMBER=${{ env.ISSUE_NUMBER }},
            CLAUDE_BRANCH=${{ env.CLAUDE_BRANCH }}.
            The approved plan is ./plan.json and A's schema is ./abschema.json.
            The branch ${{ env.CLAUDE_BRANCH }} is ALREADY checked out at
            Renovate's tip — implement (a)+(b), commit (git commit -s), push,
            open the claude PR FIRST (body: "Migrates #${{ env.PR_NUMBER }}" and
            "Closes #${{ env.ISSUE_NUMBER }}"), confirm it exists, THEN close the
            Renovate PR. File a post-bump-enhancement issue per (c) item.
```

> **`plan-final` filename note:** Wave 3's `plan-approved` re-publishes the
> approved plan under the artifact name `plan-final` from a file literally named
> `plan.json` (it downloaded `plan-round<n>` whose file is `plan.json`, then
> uploaded that same file as `plan-final`). So `download-artifact name: plan-final`
> lands `./plan.json`; D reads it directly as `./plan.json`.

- [ ] Validate the YAML:

```bash
python -c "import yaml; d=yaml.safe_load(open('.github/workflows/breaking-bump.yml')); assert 'agent-d' in d['jobs'] and d['jobs']['agent-d']['timeout-minutes']==30, 'D not the real job'; print('agent-d real job OK')"
```

Expected: `agent-d real job OK`.

## Task 4.2 — commit Wave 4

```bash
git add .github/workflows/breaking-bump.yml
git commit -s -m "feat(ci): add agent d implementer to breaking-bump pipeline"
```

(Subject 57 chars, lowercase-led, type `ci`-scoped `feat`, ASCII ✓.)

> **Wave-4 PR body must** name `CLAUDE_BOT_PAT` (workflows scope) as a hard deploy
> precondition (D edits `.github/workflows/**` when bumping `actions/*`), and note
> the irreversible side-effect (D closes the Renovate PR) — landed last, after the
> orchestration is trusted.

---

# Wave 5 — stub-agent plumbing harness (spec #10)

> **Goal:** exercise the whole chain (issue → A → B↔C → D → claude PR → spine-issue
> auto-close) with STUB agents emitting canned fixtures, **no real LLM**, so the
> orchestration (chaining, artifacts, loop guards, ordering, lifecycle) is testable
> in CI without burning tokens.
>
> **Design decision (concrete):** a repo-variable switch `BREAKING_BUMP_STUB`
> (set per-run via `workflow_dispatch` input, or repo/env variable). When `true`,
> each agent step is **bypassed**: instead of the `claude-code-action` step, a
> guarded bash step copies the matching fixture from
> `scripts/breaking-bump/stub_fixtures/` to the path the agent would have written
> (`/tmp/abschema.json`, `/tmp/abrating.txt`, `/tmp/plan.json`, `/tmp/findings.json`).
> Every `claude-code-action` step gains `if: <existing guards> && vars.BREAKING_BUMP_STUB != 'true'`;
> a sibling stub step gains the inverse `if: <existing guards> && vars.BREAKING_BUMP_STUB == 'true'`.
> The deterministic Python steps (validation, loop decision, lifecycle, fork/close)
> run UNCHANGED in both modes — they are exactly what we want to test. This keeps
> ONE workflow (the real one is the thing under test), not a forked copy that can
> drift.
>
> **Why a unit test too:** the YAML stub wiring still needs a non-CI-roundtrip
> guard against fixture rot. `test_stub_chain.py` asserts the fixtures satisfy the
> contracts the workflow consumes (schema-valid A output, B plan parses,
> C verdict approves) so a fixture that would silently break the harness fails fast
> in `breaking-bump-tests.yml`.

## Task 5.1 — write the stub fixtures

- [ ] Create `scripts/breaking-bump/stub_fixtures/abschema.json` (a schema-valid
A→B contract with one fetched source, so `zero_docs` is false and Gate A passes):

```json
{
  "dep": "stub-dep",
  "from": "1.0.0",
  "to": "2.0.0",
  "sourceConfidence": "high",
  "sources": [
    { "url": "https://example.test/stub/CHANGELOG.md", "type": "changelog", "fetchedOk": true }
  ],
  "breakingChanges": [
    {
      "summary": "renamed config key foo to bar",
      "detail": "The `foo` option has been renamed to `bar`; update your config.",
      "sourceUrl": "https://example.test/stub/CHANGELOG.md"
    }
  ],
  "deprecations": [],
  "removals": [],
  "migrationSteps": [
    {
      "instruction": "Rename `foo:` to `bar:` in all config files.",
      "sourceUrl": "https://example.test/stub/CHANGELOG.md"
    }
  ]
}
```

- [ ] Create `scripts/breaking-bump/stub_fixtures/abrating.txt` (B rates A — `high`, so Gate A passes; single line, no trailing newline issues):

```
high
```

- [ ] Create `scripts/breaking-bump/stub_fixtures/plan.round1.json` (a non-empty
plan so the chain drives the full A→B↔C→D path rather than the cleared early-exit):

```json
{
  "a": ["Rename the `foo` key to `bar` in stub-config.yaml (migrationSteps[0])."],
  "b": ["Update the version reference in docs/stub.md from 1.0.0 to 2.0.0."],
  "c": ["Adopt the new bar-batching API for throughput (optional)."]
}
```

- [ ] Create `scripts/breaking-bump/stub_fixtures/findings.round1.json` (C approves
on round 1, so the loop short-circuits after one round and dispatches D):

```json
{ "approved": true, "findings": [] }
```

## Task 5.2 — wire the stub switch into every agent step

- [ ] Edit `.github/workflows/breaking-bump.yml`. For **each** of the agent steps
(`agent-a` A step; every `b_round<n>` B step; every `c_round<n>` C step; the
`agent-d` D step), append `&& vars.BREAKING_BUMP_STUB != 'true'` to its existing
`if:` (the A/D steps have no `if:` today — add `if: vars.BREAKING_BUMP_STUB != 'true'`),
and add a sibling stub step immediately after it. The stub steps, by agent:

- [ ] **Agent A** (after the `claude-code-action` step in `agent-a`):

```yaml
      - name: STUB Agent A
        if: vars.BREAKING_BUMP_STUB == 'true'
        run: cp scripts/breaking-bump/stub_fixtures/abschema.json /tmp/abschema.json
```

- [ ] **Agent B** — in `b_round1` add a stub that also writes the rating; in
`b_round<n>` (n>=2) write only the plan (no rating step exists there):

```yaml
      # b_round1:
      - name: STUB Agent B (round 1)
        if: vars.BREAKING_BUMP_STUB == 'true'
        run: |
          cp scripts/breaking-bump/stub_fixtures/abrating.txt /tmp/abrating.txt
          cp scripts/breaking-bump/stub_fixtures/plan.round1.json /tmp/plan.json
```

```yaml
      # b_round<n>, n in 2..6 (reuses round 1's plan fixture; the loop never reaches them because C approves at round 1):
      - name: STUB Agent B (round <n>)
        if: vars.BREAKING_BUMP_STUB == 'true'
        run: cp scripts/breaking-bump/stub_fixtures/plan.round1.json /tmp/plan.json
```

- [ ] **Agent C** (each `c_round<n>` — reuses the round-1 approval fixture):

```yaml
      - name: STUB Agent C (round <n>)
        if: vars.BREAKING_BUMP_STUB == 'true'
        run: cp scripts/breaking-bump/stub_fixtures/findings.round1.json /tmp/findings.json
```

- [ ] **Agent D** (in `agent-d`, after the real D step) — a stub that performs the
real fork/PR/close side-effects deterministically (so the lifecycle IS tested),
but writes a trivial migration commit instead of running an LLM:

```yaml
      - name: STUB Agent D (deterministic fork/close)
        if: steps.rev.outputs.skip == 'false' && vars.BREAKING_BUMP_STUB == 'true'
        env:
          GH_TOKEN: ${{ secrets.CLAUDE_BOT_PAT || secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          echo "stub migration for $DEP $FROM -> $TO" > .breaking-bump-stub-migration.txt
          git add .breaking-bump-stub-migration.txt
          git commit -s -m "chore(breaking-bump): stub migration for $DEP"
          git push -u origin "$CLAUDE_BRANCH"
          CLAUDE_URL=$(gh pr create --base main --head "$CLAUDE_BRANCH" \
            --title "chore(breaking-bump): migrate $DEP to $TO (stub)" \
            --body "Migrates #$PR_NUMBER. Closes #$ISSUE_NUMBER." --json url --jq .url)
          gh pr view "$CLAUDE_BRANCH" >/dev/null   # confirm real BEFORE closing Renovate
          gh pr close "$PR_NUMBER" --comment "Superseded by $CLAUDE_URL (stub run)."
```

- [ ] Add the `workflow_dispatch` test trigger (so the harness can be driven by
hand on a scratch issue without a real Renovate PR). Extend the `on:` block:

```yaml
on:
  issues:
    types: [labeled]
  workflow_dispatch:
    inputs:
      issue_number:
        description: 'Spine issue number to run the pipeline against (stub or live)'
        required: true
```

- [ ] Make the issue-number references tolerate `workflow_dispatch`. In
`read-context`, source the body + number from either event. Replace the
`read-context` job's `if:` and add a body-resolver step **before** the parse step:

```yaml
  read-context:
    if: >-
      github.event_name == 'workflow_dispatch' ||
      contains(github.event.issue.labels.*.name, 'breaking-bump')
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      # Single source of truth for the issue number across both triggers.
      ISSUE_NUMBER: ${{ github.event.issue.number || github.event.inputs.issue_number }}
    outputs:
      valid: ${{ steps.ctx.outputs.valid }}
      dep: ${{ steps.ctx.outputs.dep }}
      from: ${{ steps.ctx.outputs.from }}
      to: ${{ steps.ctx.outputs.to }}
      pr: ${{ steps.ctx.outputs.pr }}
      claude_branch: ${{ steps.ctx.outputs.claude_branch }}
      issue_number: ${{ env.ISSUE_NUMBER }}
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with: { fetch-depth: 1 }
      - uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
        with: { python-version: '3.14.6' }
      - run: pip install -r scripts/breaking-bump/requirements.txt
      - name: Resolve the issue body
        id: body
        run: |
          set -euo pipefail
          gh issue view "$ISSUE_NUMBER" --json body --jq .body > /tmp/issue-body.md
      - name: Parse the context block
        id: ctx
        run: |
          set -euo pipefail
          python - <<'PY'
          import os, sys
          sys.path.insert(0, "scripts/breaking-bump")
          import issue, identity
          body = open("/tmp/issue-body.md").read()
          ctx = issue.parse_context_block(body)
          out = open(os.environ["GITHUB_OUTPUT"], "a")
          if not ctx:
              out.write("valid=false\n"); sys.exit(0)
          dep, frm, to, pr = ctx["dep"], ctx["from"], ctx["to"], ctx["pr"]
          out.write("valid=true\n")
          out.write(f"dep={dep}\nfrom={frm}\nto={to}\npr={pr}\n")
          out.write(f"claude_branch={identity.claude_branch(dep, to)}\n")
          PY
```

> **`ISSUE_NUMBER` everywhere:** every downstream job currently uses
> `${{ github.event.issue.number }}` for `ISSUE_NUMBER`. Change each to
> `${{ needs.read-context.outputs.issue_number }}` so `workflow_dispatch` runs
> resolve the number too. (The `escalate` and `plan-approved` jobs already
> `needs: read-context`; the round jobs do too.) This is a mechanical
> find-and-replace of the one expression.

- [ ] Validate the YAML and confirm every agent `claude-code-action` step is
stub-guarded:

```bash
python - <<'PY'
import yaml
d = yaml.safe_load(open('.github/workflows/breaking-bump.yml'))
ok = True
for jn, job in d['jobs'].items():
    for st in job.get('steps', []):
        if str(st.get('uses', '')).startswith('anthropics/claude-code-action'):
            cond = st.get('if', '')
            if "BREAKING_BUMP_STUB != 'true'" not in cond:
                print(f"UNGUARDED agent step in {jn}: {st.get('name')}"); ok = False
print('all agent steps stub-guarded' if ok else 'FAIL')
PY
```

Expected: `all agent steps stub-guarded`.

## Task 5.3 — write the fixture-contract test

- [ ] Create `scripts/breaking-bump/test_stub_chain.py`:

```python
"""Guard the stub fixtures against rot: they must satisfy the workflow contracts."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import abparse  # noqa: E402
import loop  # noqa: E402

_FIX = Path(__file__).parent / "stub_fixtures"


def test_stub_abschema_is_contract_valid():
    doc, errors = abparse.load_schema(_FIX / "abschema.json")
    assert errors == [], errors
    # Gate A must PASS on the stub (a source was fetched), so the chain proceeds.
    assert abparse.zero_docs(doc) is False


def test_stub_abrating_passes_gate_a():
    rating = (_FIX / "abrating.txt").read_text().strip()
    assert rating in {"high", "medium"}


def test_stub_plan_is_non_empty_so_d_dispatches():
    plan = json.loads((_FIX / "plan.round1.json").read_text())
    # Non-empty (a)+(b) -> NOT the cleared early-exit -> Agent D runs.
    assert abparse.early_exit(plan) is False


def test_stub_findings_approve_round_one():
    verdict = abparse.load_verdict(_FIX / "findings.round1.json")
    assert loop.c_approved(verdict) is True
    done, reason = loop.loop_done(approved=True, identical=False, round_no=1,
                                  max_rounds=6)
    assert done and reason == "approved"
```

- [ ] Run it + the whole package:

```bash
cd scripts/breaking-bump && python -m pytest test_stub_chain.py -v && python -m pytest -v
```

Expected: all tests pass.

## Task 5.4 — commit Wave 5

```bash
git add scripts/breaking-bump/stub_fixtures scripts/breaking-bump/test_stub_chain.py \
        .github/workflows/breaking-bump.yml
git commit -s -m "test(breaking-bump): add stub-agent plumbing harness for the pipeline"
```

(Subject 65 chars, lowercase-led, type `test`, ASCII ✓.)

> **Wave-5 PR body must** explain how to run the harness: set the repo variable
> `BREAKING_BUMP_STUB=true`, create a scratch issue carrying a context block +
> the `breaking-bump` label (or `workflow_dispatch` with its number), and watch
> the run drive A→B↔C→D with fixtures, opening a stub claude PR and closing the
> (scratch) Renovate PR. Unset the variable to return to live mode.

---

## Final verification (run before opening each wave's PR)

- [ ] Whole Python package green:

```bash
cd scripts/breaking-bump && python -m pytest -v
```

- [ ] The pipeline workflow + prompts exist and parse:

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/breaking-bump.yml')); print('pipeline yaml OK')"
ls .github/breaking-bump/prompts/agent-a.md .github/breaking-bump/prompts/agent-b.md \
   .github/breaking-bump/prompts/agent-c.md .github/breaking-bump/prompts/agent-d.md
```

- [ ] All 12 round jobs + the gate + escalate + agent-d present:

```bash
python -c "import yaml; j=yaml.safe_load(open('.github/workflows/breaking-bump.yml'))['jobs']; need=['read-context','agent-a','plan-approved','agent-d','escalate']+[f'{p}_round{n}' for p in ('b','c') for n in range(1,7)]; missing=[x for x in need if x not in j]; assert not missing, missing; print('all jobs present')"
```

---

## Spec-coverage map (self-review)

| Spec item | Where covered |
|---|---|
| Issue-as-spine trigger (`on: issues`, label-gated, context from body) #11 | Wave 3 `read-context` + workflow `if:` |
| Stray-label guard (no context block → no-op) #11 | Wave 3 `read-context` `valid=false` |
| Concurrency `cancel-in-progress: false` #11 | Wave 3 `concurrency:` (issue-number keyed — see OPEN QUESTION) |
| Agent A — doc gatherer, never reads code, A→B schema, zero-doc tripwire | Wave 2 `agent-a.md` + Wave 3 `agent-a` job + `schema.py`/`abparse.zero_docs` |
| A→B schema #3 (validated by `schema.py`) | Wave 3 `agent-a` validate step |
| Ascending ratings #5 (B rates A, C rates B, §6a rates D) | Wave 3 `b_round1` rate step (Gate A) + every `c_round<n>` + downstream §6a |
| Categorized B output (a)/(b)/(c) | Wave 2 `agent-b.md` + `abparse.early_exit` |
| (a)+(b)-empty early-exit → ai-cleared + close | Wave 3 `plan-approved` cleared path |
| B↔C bounded loop ≤6 rounds, unrolled #4 | Wave 3 `b_round1..6`/`c_round1..6` |
| Identical-finding terminator #4 | Wave 3 `c_round<n>` `PREV_HASH` + `loop.findings_identical`/`loop_done` |
| Loop non-convergence → escalate #4 | Wave 3 `plan-approved` no-winner `exit 1` → `escalate` |
| Each round posts to the spine issue | Wave 2 prompts' "post to the spine issue" + agents' `gh issue comment` tool |
| Agent D fork from Renovate tip, open-PR-first, close Renovate #6 | Wave 4 `agent-d` `rev` + D prompt |
| D idempotency guard #9 | Wave 4 `rev` step `gh pr list --head` |
| D category-(c) → `post-bump-enhancement` issue | Wave 2 `agent-d.md` Step 5 |
| Failure → spine issue `needs-human` (`if: failure()`) #9 | Wave 3 `escalate` job |
| Stub-agent plumbing test #10 | Wave 5 (switch + fixtures + `test_stub_chain.py`) |
| Versioned per-agent prompts | Wave 2 |
| SHA-pinned actions, thin YAML, logic in tested core | All waves |

---

## OPEN QUESTIONS (flagged, not silently guessed)

1. **Concurrency group is `breaking-bump-issue-<number>`, not the spec's
   `breaking-bump-<slug>`.** The spec specifies `breaking-bump-<slug>` where
   `<slug> = <dep>-<from>-<to>`. But `concurrency.group` is evaluated **before any
   job step runs**, and the slug requires parsing the issue body — not available
   at template-expansion time without a separate pre-job (and concurrency cannot
   key on another job's output). Issue-number keying still serialises this issue's
   `opened`+`labeled` events (the only re-fire source, since Step 0 creates exactly
   one issue per identity, and one issue == one number). The case it *doesn't*
   serialise — two different issues for the same `<dep>@<from>→<to>` — cannot occur
   because Plan 2's dispatcher dedups on identity before creating. **Recommendation:**
   accept issue-number keying. If the maintainer wants the literal slug group, it
   requires a workflow-level redesign (the slug isn't knowable pre-step); not worth
   it for an impossible race. Mirrors the same decision Plan 2 made for `step0-<slug>`.

2. **RESOLVED.** `dispatch_d` and `cleared` are now declared against `steps.classify.outputs.*`
   (the step that writes them on the converged path); `winning_round` stays against
   `steps.pick.outputs.winning_round` (the step that writes it). The no-converge path
   `exit 1`s inside `pick` before any consumer reads `dispatch_d`/`cleared`, so those
   outputs being absent on that branch is safe — the run fails and `escalate` runs.

3. **`vars.BREAKING_BUMP_STUB` is a repo/environment variable, not a secret.**
   The harness reads `vars.*` (Actions repo variables). The maintainer must create
   it (`gh variable set BREAKING_BUMP_STUB --body true`) to run stub mode and
   delete/unset it for live mode. An alternative — a `workflow_dispatch` boolean
   input — only covers the dispatch trigger, not `on: issues` runs, so a repo
   variable is the chosen mechanism (works for both triggers). Flagged so the
   maintainer knows stub mode is a deliberate repo-state toggle, not per-run.
