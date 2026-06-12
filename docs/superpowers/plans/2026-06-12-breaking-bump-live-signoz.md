# Breaking-bump Pipeline — Plan 4: flip signoz live + retire helm-enrich + spend observability

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the now-fully-built breaking-bump pipeline (Plans 1–3, all merged on `main`) LIVE on real `signoz` Renovate bump PRs — retiring its predecessor `helm-bump-enrich` (ADR-0067) into Agent A so the two don't double-fire, bounding the lab blast radius, and surfacing per-bump cost (USD) — gated on an explicit maintainer go/no-go before the first live run.

**Architecture:** The pipeline is already wired end-to-end and exercisable with stub fixtures; nothing is "dark-launched" behind a feature flag. The blockers to a real run are operational, not code: `helm-bump-enrich.yml` still fires on `infra/observability/Chart.yaml` Renovate PRs (the same signoz bump the dispatcher routes), Agent A does not yet carry the helm values-diff that enrich provided, the lab inflow is unbounded (`prConcurrentLimit: 5`), spend is invisible, and the `BREAKING_BUMP_STUB` repo variable + `CLAUDE_BOT_PAT` secret must be in the right state. Plan 4 lands these as five ordered, independently-mergeable PR waves, each leaving the system working, with a hard maintainer checkpoint immediately before the first live signoz run.

**Tech Stack:** Python 3.14 + pytest + jsonschema + hypothesis + pyyaml (`scripts/breaking-bump/`, `scripts/helm-enrich/`); GitHub Actions + `anthropics/claude-code-action@v1`, `actions/{checkout,setup-python}` (SHA-pinned); `gh` CLI; Renovate (`renovate.json`); ADR markdown + `docs/adr/INDEX.md`; SigNoz/OTel observability stack (`infra/observability/`, dashboards-as-code under `infra/observability/dashboards/`).

**Source spec:** `docs/superpowers/specs/2026-06-11-renovate-bump-supervisor-design.md`. Read in full before starting — Plan 4 implements its **Rollout strategy** (signoz first), the **Prerequisites** `CLAUDE_BOT_PAT` precondition, **Reuse of existing pieces** (helm-enrich → Agent A), and resolved OPEN QUESTIONS **#2/#8** (Agent A subsumes helm-bump-enrich + the values-diff carryover), **#10** (first live test = signoz `0.122.0 → 0.128.0`), **#12** (ADR-0067 superseded by ADR-0068; INDEX.md rows), and **#13** (cost guardrails: allowlist breadth, lower `prConcurrentLimit`, dark feature-flag kill switch, spend observability not a hard budget).

**Depends on (already on `main` via Plans 1–3 — verified 2026-06-12):**
- `.github/workflows/breaking-bump-dispatch.yml` — Step 0 dispatcher + AI gate; **already allowlist-gates to signoz-only** (`scripts/breaking-bump/allowlist.yaml` = `[signoz]`).
- `.github/workflows/breaking-bump.yml` — the `on: issues` pipeline (A → B↔C×6 → D), with the `BREAKING_BUMP_STUB` switch + `workflow_dispatch` trigger already wired.
- `.github/workflows/breaking-bump-labels.yml` — one-shot label bootstrap (the 5 labels).
- `.github/workflows/claude-code-review.yml` — **§6a already suppressed on `renovate/*`** (`!startsWith(github.head_ref, 'renovate/')`, line 53).
- `renovate.json` — the `update:{{updateType}}` label rule + `prConcurrentLimit: 5` + `prHourlyLimit: 1`.
- `scripts/breaking-bump/**`, `.github/breaking-bump/prompts/**` (A/B/C/D + ai-gate).
- **Predecessor (to retire this plan):** `.github/workflows/helm-bump-enrich.yml`, `helm-bump-enrich-sweep.yml`, `helm-enrich-tests.yml`; `scripts/helm-enrich/**` (`detect.py`, `classify.py`, `registry.py`, `valuesdiff.py` + tests); ADR-0067 (`docs/adr/0067-internal-tool-upgrade-enrichment.md`, status already "Superseded by ADR-0068").

---

## What actually holds signoz back from firing live (verified against the artifacts)

There is **no dark-launch flag** to flip. The dispatcher is `on: pull_request`, allowlist-gated to signoz, and would create a spine issue on the next real signoz bump *today*. The real blockers, in order:

1. **`helm-bump-enrich.yml` double-fires on signoz.** It triggers on `pull_request` + `paths: infra/**/Chart.yaml` from `renovate/*` (lines 6–10). signoz lives at `infra/observability/Chart.yaml`, so a signoz Renovate PR runs **both** ADR-0067 enrich (posts a context comment) **and** ADR-0068 dispatch (creates a spine issue + runs A/B/C/D). Two AI workflows, duplicate token spend, contradictory comments. **This must be resolved before live** (Wave 3) — and the values-diff enrich provided must be re-homed into Agent A first (Wave 2) so retiring enrich loses nothing.
2. **`BREAKING_BUMP_STUB` repo variable.** When `vars.BREAKING_BUMP_STUB == 'true'`, every agent step is bypassed by a fixture-copy stub (`breaking-bump.yml` lines 104/118/170/184/235…). A live run requires it **unset / `false`**. This is a repo-state toggle (Plan 3 OPEN QUESTION 3), not code — documented + verified in Wave 5's go/no-go, not edited here.
3. **`CLAUDE_BOT_PAT` secret (workflows scope).** Agent D's checkout uses `secrets.CLAUDE_BOT_PAT || secrets.GITHUB_TOKEN`; the fallback `GITHUB_TOKEN` **cannot** push `.github/workflows/**` edits. signoz's migration is helm/docs only (no workflow edit), so the fallback technically suffices for *this* dep — but the PAT is a hard precondition for the pipeline's general correctness and the next deps. Documented as a Wave-5 precondition.
4. **Unbounded lab inflow.** `prConcurrentLimit: 5` lets up to 5 Renovate PRs (hence up to 5 pipelines) exist at once. Lower it for the bounded lab (Wave 4).
5. **No cost visibility.** The pipeline spawns up to 14 `claude-code-action` jobs per bump (A + 6×{B,C} + D); nothing surfaces the per-bump cost (USD) (Wave 1).

Concern → wave map: **#5 cost → Wave 1** · **helm-enrich→Agent A absorption → Wave 2** · **#4 retire helm-enrich + ADR-0067/INDEX coherence → Wave 3** · **#2 lower prConcurrentLimit → Wave 4** · **#1 flip live (go/no-go + first run + rollback) → Wave 5**.

---

## ADR pre-read (do this first, once)

This plan touches `.github/workflows/`, `scripts/breaking-bump/`, `scripts/helm-enrich/`, `renovate.json`, `infra/observability/`, and `docs/adr/`. Run:

```bash
scripts/adr-context.sh .github/workflows/breaking-bump.yml .github/workflows/helm-bump-enrich.yml scripts/breaking-bump/prmeta.py renovate.json docs/adr/0067-internal-tool-upgrade-enrichment.md infra/observability/Chart.yaml
```

Read every ADR it emits in full (per CLAUDE.md). Landmarks: **ADR-0068** (this pipeline — already merged; registers `breaking-bump-*` workflows, `scripts/breaking-bump/**`, prompts, and `infra/tools-upgrade-sources.yaml`), **ADR-0067** (helm-enrich — superseded; the values-diff carryover Agent A must absorb), **ADR-0001** (workflow, §6a, 400-line cap, feature-flag expiry discipline), **ADR-0027/0041** (SigNoz/ClickHouse — the spend-observability surface).

## Local prerequisite

CI's `setup-python` provides `python`; on macOS the binary is `python3`. Before running tests: `pip install -r scripts/breaking-bump/requirements.txt` and (for Wave 2/3) `pip install -r scripts/helm-enrich/requirements.txt`.

## Deployment preconditions (document, do not implement in code)

- **`BREAKING_BUMP_STUB` repo variable must be unset (or `false`) for live runs.** Verify with `gh variable list`. If present and `true`, the pipeline runs stub fixtures, not real agents. Wave 5's go/no-go gates on this.
- **`CLAUDE_BOT_PAT` (fine-grained PAT, `workflows` write scope)** provisioned as a repo secret. Verify with `gh secret list | grep CLAUDE_BOT_PAT`. signoz needs no workflow-file edit so the `GITHUB_TOKEN` fallback works for the first run, but the PAT is the general precondition (a later `actions/*` bump *will* need it). Wave 5 documents this.
- **`CLAUDE_CODE_OAUTH_TOKEN`** already provisioned (used by every agent job + the AI gate). No action.
- **The 5 labels exist** — `breaking-bump-labels.yml` was dispatched in Plan 2. Verify with `gh label list | grep -E 'ai-driven|breaking-bump|ai-cleared|needs-human|post-bump-enhancement'`.

---

## Execution model: waves of PRs

Five PR waves; each goes through its full review cycle (§6a + maintainer) and **merges before the next wave starts**, so review feedback reshapes what follows. Every wave is < 400 lines of hand-written diff. **Wave 5 is gated on an explicit maintainer go/no-go** — it flips a live, token-spending, PR-mutating automation onto production dependency bumps. Do not execute Wave 5 without recorded maintainer approval.

| Wave / PR | Title (one line) | Files | Why this order | ~Diff |
|---|---|---|---|---|
| **Wave 1** | per-bump cost (USD) observability on the spine issue | `scripts/breaking-bump/spend.py` (+test), `.github/workflows/breaking-bump.yml` (incl. 1-line concurrency-group fix) | Pure tested helper + one comment-step per agent job. No live behaviour change; lands first so the *very first* live run already reports cost. Independent of the others. | ~185 |
| **Wave 2** | Agent A absorbs the helm values-diff (enrich carryover) | `scripts/breaking-bump/valuesdiff.py` (+test, ported), `.github/breaking-bump/prompts/agent-a.md`, `.github/workflows/breaking-bump.yml` | The one capability helm-enrich had that Agent A lacked. Must land **before** retiring enrich (Wave 3) so nothing is lost — the spec's "values-diff survives as a helm-only extra". | ~260 |
| **Wave 3** | retire helm-bump-enrich into ADR-0068 (governance + de-wire) | delete `.github/workflows/helm-bump-enrich*.yml`, `scripts/helm-enrich/**`; `docs/adr/0067-*.md`, `docs/adr/INDEX.md`, `renovate.json` (helmv3 comment) | Removes the double-fire (blocker #1). ADR/governance + registry-coherence land here. After Wave 2 the carryover is safe; after this, a signoz bump fires the pipeline ONLY. | ~150 |
| **Wave 4** | bound the lab — lower `prConcurrentLimit` | `renovate.json` | One-line reversible inflow cap for the controlled rollout (spec #13). Trivial, isolated, lands right before go-live. | ~10 |
| **Wave 5** | go-live runbook + maintainer go/no-go + first signoz run | `docs/superpowers/runbooks/2026-06-12-breaking-bump-signoz-golive.md` (new) | The actual flip: a documented runbook (preconditions, trigger, per-stage observation, success criteria, rollback). **MAINTAINER GO/NO-GO CHECKPOINT.** No pipeline code changes — it operationalises Waves 1–4. | ~190 |

> **Why governance is Wave 3, not Wave 1:** the usual "ADR/governance first" rule (CLAUDE.md plan-as-PR-waves) puts the *spec doc* in Wave 1. Here the spec (ADR-0068) is **already merged** and already declares "ADR-0067 superseded; helm-enrich absorbed into Agent A". Wave 3 doesn't *decide* the supersession — it *executes* the de-wiring the merged ADR already mandated. Executing it before Wave 2's carryover lands would delete the values-diff with no replacement. So the dependency order (carryover before deletion) overrides the governance-first heuristic. Wave 3 still satisfies `registry-coherence` (it touches `0067-*.md` → it touches `INDEX.md` in the same PR).

---

## File Structure

| File | Wave | New/Mod | Responsibility |
|---|---|---|---|
| `scripts/breaking-bump/spend.py` | 1 | New | `format_spend(stage, execution_file)` — render a one-line per-stage cost (USD) comment by reading the `claude-code-action` `execution_file` (the `type=="result"` entry's `total_cost_usd`); tolerant of missing/None/unparseable paths ("cost unavailable"). |
| `scripts/breaking-bump/test_spend.py` | 1 | New | Unit tests for `spend.py`. |
| `.github/workflows/breaking-bump.yml` | 1 | Mod | Add a "report spend" step to each agent job (A, every `b_round<n>`, every `c_round<n>`, D) that posts the formatted line to the spine issue. |
| `scripts/breaking-bump/valuesdiff.py` | 2 | New (ported) | Helm chart `values*.yaml` key-path diff + override-flagging, ported from `scripts/helm-enrich/valuesdiff.py` so it survives enrich's removal. |
| `scripts/breaking-bump/test_valuesdiff.py` | 2 | New (ported) | Unit tests for the ported `valuesdiff.py`. |
| `.github/breaking-bump/prompts/agent-a.md` | 2 | Mod | Add the helm-only values-diff extra (run the diff on a `helmv3` bump, attach to the enrichment). |
| `.github/workflows/breaking-bump.yml` | 2 | Mod | In `agent-a`, add a guarded "helm values-diff" step (runs only for helm bumps) that produces `/tmp/valuesdiff.json` for Agent A to read. |
| `.github/workflows/helm-bump-enrich.yml` | 3 | Delete | Predecessor enrichment workflow (double-fires on signoz). |
| `.github/workflows/helm-bump-enrich-sweep.yml` | 3 | Delete | Predecessor daily sweep. |
| `.github/workflows/helm-enrich-tests.yml` | 3 | Delete | Predecessor script CI. |
| `scripts/helm-enrich/**` | 3 | Delete | Predecessor deterministic core (carryover ported in Wave 2). |
| `docs/adr/0067-internal-tool-upgrade-enrichment.md` | 3 | Mod | Append a "Retired 2026-06-12" note recording the workflow/script removal. |
| `docs/adr/INDEX.md` | 3 | Mod | Remove the `ADR-0067 helm-bump-enrich*.yml` + `scripts/helm-enrich/**` rows; keep the ADR-0068 rows. |
| `renovate.json` | 3 | Mod | Update the `helmv3` packageRule comment (drop the ADR-0067 enrich reference). |
| `renovate.json` | 4 | Mod | `prConcurrentLimit: 5 → 2`. |
| `docs/superpowers/runbooks/2026-06-12-breaking-bump-signoz-golive.md` | 5 | New | The go-live runbook: preconditions, go/no-go, trigger, per-stage observation, success criteria, rollback. |

`breaking-bump-tests.yml` already globs `scripts/breaking-bump/**`, so all new `test_*.py` run in CI with no workflow edit.

---

## Locked implementation decisions (where the spec left a choice)

1. **Cost is reported per stage as a spine-issue comment, never a hard budget (spec #13: "spend observability, not a hard budget").** Each agent job appends one line — `breaking-bump spend · <stage>: $<cost>` — to the spine issue after the agent runs. `claude-code-action@v1` writes an `execution_file` (a path to a JSON array execution log); its single `type=="result"` entry carries `total_cost_usd` (a USD float) — verified against the action's `action.yml` + `test/fixtures/sample-turns.json` (`total_cost_usd: 0.0347`). `spend.py` reads that and renders `$0.0347`; when the path is None/missing/unparseable or no result entry is found (e.g. a STUB run produces no `execution_file`), it renders "cost unavailable" rather than crashing the step. The action exposes **no** direct token/cost step output, so the `execution_file` is the source of truth (per-turn token usage, never needed here, lives on `type=="assistant"` entries under `message.usage`). **No ClickHouse/SigNoz wiring in v1** — the spine issue is the durable per-bump ledger and matches the spec's "log per-stage + surface per-bump cost as a comment on the spine issue". A SigNoz dashboard aggregating cost across bumps is explicitly deferred (it needs an exporter the action doesn't provide; YAGNI until the numbers surprise us, per spec #13's deferred hard-budget note). Flagged below.

2. **The values-diff is ported into `scripts/breaking-bump/`, not imported cross-directory.** Wave 3 deletes `scripts/helm-enrich/`, so Agent A cannot depend on it. The spec says the values-diff "stays as a helm-only extra A attaches" — so the pure diff functions move into the breaking-bump core. The port is a **literal `cp`** of the source (`KeyChange`/`flatten`/`diff_values`/`mark_overrides`, lists-as-leaves), re-running the source's own copied tests; only an appended `main()` CLI is new, so the carryover is literal, not a rewrite.

3. **The values-diff runs as a deterministic workflow step, fed to Agent A as data — Agent A does not compute it.** A "never reads our code" (it is doc-bound); reading our `values*.yaml` is a repo read, which would muddy A's mandate. So the workflow computes `/tmp/valuesdiff.json` (helm bumps only) and the prompt tells A to *attach* it verbatim to the enrichment. This keeps A's hard-context isolation while preserving the carryover.

4. **Retirement = delete, not repurpose.** ADR-0068 says helm-enrich is "re-homed under Agent A, not deleted day one" — "day one" was Plan 3. By Plan 4 the pipeline is built and (Wave 2) carries the values-diff, so the workflows + scripts are genuinely redundant and are removed. ADR-0067 stays in the tree as a superseded record (its status line already says so) with a retirement note appended; only the *executable* surface is deleted.

5. **`prConcurrentLimit: 2`, not the spec's "2–3".** The spec offers a range; pick **2** for the tightest meaningful lab bound (signoz is one dep; 2 leaves headroom for one signoz pipeline + one unrelated trivial bump without starving the queue). `prHourlyLimit: 1` already caps the rate; 2 caps simultaneity. Reversible one-liner.

6. **Wave 5 changes no pipeline code.** The flip is operational: the dispatcher already fires on signoz. Wave 5 is a runbook + the maintainer checkpoint + observing the first real run. The "rollback" levers are the dark feature-flag kill switch (`BREAKING_BUMP_STUB=true` re-stubs the pipeline instantly; or empty the allowlist) — both documented, neither requires a code revert.

---

# Wave 1 — per-bump cost (USD) observability

> **Goal:** every agent job posts its cost (USD) to the spine issue, so the first live signoz run already shows what it cost. Pure tested helper + a thin comment step per job. No behavioural change to routing or agents. (Also folds in a 1-line concurrency-group fix — see Task 1.0.)

## Task 1.0 — fix the pre-existing concurrency-group quirk (1 line)

> The pipeline's `concurrency.group` is `breaking-bump-issue-${{ github.event.issue.number }}`, which is **empty under `workflow_dispatch`** (the dispatch smoke path, runbook §3 path B). For real `on: issues` runs `github.event.issue.number` is set, so adding a `workflow_dispatch` fallback leaves the group **UNCHANGED** for live runs — no behaviour change to the path of record, preserving Wave 1's "no behaviour change to real runs" property. It only gives dispatch smoke-tests a proper per-issue slot.

- [ ] In `.github/workflows/breaking-bump.yml`, change the top-level `concurrency.group`:

Replace:
```yaml
concurrency:
  group: breaking-bump-issue-${{ github.event.issue.number }}
```
with:
```yaml
concurrency:
  group: breaking-bump-issue-${{ github.event.issue.number || github.event.inputs.issue_number }}
```

(`workflow_dispatch` is already wired with an `issue_number` input — see runbook §3 path B `gh workflow run breaking-bump.yml -f issue_number=<N>`.)

- [ ] Confirm the fallback is present:

```bash
grep -n 'github.event.inputs.issue_number' .github/workflows/breaking-bump.yml
```

Expected: one match on the `concurrency.group` line.

## Task 1.1 — write `spend.py` tests (RED)

- [ ] Create `scripts/breaking-bump/test_spend.py`:

```python
"""Unit tests for spend — rendering per-stage cost (USD) lines for the spine issue."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import spend  # noqa: E402

# Mirror of claude-code-action@v1's execution_file: a JSON array whose
# type=="result" entry carries total_cost_usd (verified against the action's
# test/fixtures/sample-turns.json — total_cost_usd: 0.0347, no usage field).
RESULT_LOG = [
    {"type": "assistant", "message": {"usage": {"input_tokens": 1200, "output_tokens": 340}}},
    {"type": "result", "total_cost_usd": 0.0347, "duration_ms": 4210},
]


def test_format_spend_reports_cost(tmp_path):
    f = tmp_path / "execution.json"
    f.write_text(json.dumps(RESULT_LOG), encoding="utf-8")
    line = spend.format_spend("agent-a", str(f))
    assert line == "breaking-bump spend · agent-a: $0.0347"


def test_format_spend_none_path_is_unavailable():
    # STUB runs produce no execution_file → must degrade, not crash.
    line = spend.format_spend("agent-d", None)
    assert line == "breaking-bump spend · agent-d: cost unavailable"


def test_format_spend_missing_file_is_unavailable(tmp_path):
    line = spend.format_spend("c_round2", str(tmp_path / "nope.json"))
    assert line == "breaking-bump spend · c_round2: cost unavailable"


def test_format_spend_garbage_json_is_unavailable(tmp_path):
    f = tmp_path / "garbage.json"
    f.write_text("{ this is not json", encoding="utf-8")
    line = spend.format_spend("b_round1", str(f))
    assert line == "breaking-bump spend · b_round1: cost unavailable"


def test_format_spend_no_result_entry_is_unavailable(tmp_path):
    f = tmp_path / "no_result.json"
    f.write_text(json.dumps([{"type": "assistant", "message": {}}]), encoding="utf-8")
    line = spend.format_spend("agent-a", str(f))
    assert line == "breaking-bump spend · agent-a: cost unavailable"
```

- [ ] Run, see it fail (`ModuleNotFoundError: No module named 'spend'`):

```bash
cd scripts/breaking-bump && python -m pytest test_spend.py -v
```

Expected: collection error / `ModuleNotFoundError`.

## Task 1.2 — implement `spend.py` (GREEN)

- [ ] Create `scripts/breaking-bump/spend.py`:

```python
"""Render a one-line per-stage cost (USD) summary for the spine issue.

Spec #13: spend observability, not a hard budget — log per-stage, surface
per-bump cost as a comment on the spine issue. claude-code-action@v1 exposes no
direct token/cost step output; instead it writes an execution_file (a JSON array
execution log) whose single type=="result" entry carries total_cost_usd (a USD
float). A STUB run produces no execution_file, so a missing/unparseable path must
degrade to 'cost unavailable' rather than crash the workflow step.
"""
from __future__ import annotations

import json
from pathlib import Path


def _result_cost_usd(execution_file: str | None) -> float | None:
    """Read total_cost_usd from the execution log's type=='result' entry; None if absent."""
    if not execution_file:
        return None
    try:
        entries = json.loads(Path(execution_file).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(entries, list):
        return None
    for entry in entries:
        if isinstance(entry, dict) and entry.get("type") == "result":
            cost = entry.get("total_cost_usd")
            if isinstance(cost, (int, float)):
                return float(cost)
    return None


def format_spend(stage: str, execution_file: str | None) -> str:
    """One-line cost summary for `stage`; 'cost unavailable' when no cost can be read."""
    cost = _result_cost_usd(execution_file)
    if cost is None:
        return f"breaking-bump spend · {stage}: cost unavailable"
    return f"breaking-bump spend · {stage}: ${cost:.4f}"
```

- [ ] Run, see it pass (`5 passed`), then the whole package:

```bash
cd scripts/breaking-bump && python -m pytest test_spend.py -v && python -m pytest -v
```

Expected: `5 passed` then all package tests green.

## Task 1.3 — add a spend-report step to each agent job

> **Mechanism:** `claude-code-action@v1` exposes no direct token/cost output — it writes an `execution_file` (a path to a JSON-array execution log) surfaced as `steps.<id>.outputs.execution_file`. Give each agent's `claude-code-action` step an `id` (A's may already have one — if not, add `id: agent`), then add a step after it that runs `spend.py <stage> "<execution_file>"` and posts the line with `gh issue comment`. The line content flows via an env var (`$LINE`), **not** `${{ }}` interpolation inside `run:`. Each step is guarded `if: vars.BREAKING_BUMP_STUB != 'true'` so stub runs stay cost-free and silent; even if reached, an absent `execution_file` renders "cost unavailable" and never breaks the run.

- [ ] For the `agent-a` job in `.github/workflows/breaking-bump.yml`: ensure the `claude-code-action` step has `id: agent`, then add immediately after it (before the tripwire step):

```yaml
      - name: Report spend (agent-a)
        if: vars.BREAKING_BUMP_STUB != 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          STAGE: agent-a
          EXECUTION_FILE: ${{ steps.agent.outputs.execution_file }}
        run: |
          set -euo pipefail
          LINE=$(python scripts/breaking-bump/spend.py "$STAGE" "$EXECUTION_FILE")
          gh issue comment "$ISSUE_NUMBER" --body "$LINE"
```

- [ ] For **each** `b_round<n>` (n in 1..6): give the B `claude-code-action` step `id: agent` and append the same step with `STAGE: b_round<n>`. For **each** `c_round<n>`: `id: agent`, `STAGE: c_round<n>`. For `agent-d`: `id: agent` on its `claude-code-action` step, `STAGE: agent-d`. Every spend step's `EXECUTION_FILE` reads its own job's `steps.agent.outputs.execution_file`. (13 near-identical steps — "N copies of the same line".) The `ISSUE_NUMBER` env var already exists on every one of these jobs (used by the agent prompts).

- [ ] `spend.py` must accept the stage + execution-file path as CLI args. Add a `__main__` block to `scripts/breaking-bump/spend.py` (the workflow shells to it):

```python
if __name__ == "__main__":
    import sys

    _stage = sys.argv[1] if len(sys.argv) > 1 else "unknown"
    _exec = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
    print(format_spend(_stage, _exec))
```

- [ ] Validate the YAML parses and every agent job has a spend step:

```bash
python - <<'PY'
import yaml
d = yaml.safe_load(open('.github/workflows/breaking-bump.yml'))
agent_jobs = ['agent-a', 'agent-d'] + [f'{p}_round{n}' for p in ('b', 'c') for n in range(1, 7)]
missing = []
for jn in agent_jobs:
    names = [s.get('name', '') for s in d['jobs'][jn]['steps']]
    if not any(n.startswith('Report spend') for n in names):
        missing.append(jn)
assert not missing, f"jobs missing a spend step: {missing}"
print("all 14 agent jobs report spend")
PY
```

Expected: `all 14 agent jobs report spend`.

## Task 1.4 — commit Wave 1

```bash
git add scripts/breaking-bump/spend.py scripts/breaking-bump/test_spend.py \
        .github/workflows/breaking-bump.yml
git commit -s -m "feat(breaking-bump): report per-stage cost (usd) on the spine issue"
```

(Subject 62 chars, lowercase-led, type `feat`, ASCII OK.)

> **Wave-1 PR body must:** note this is observability-only (no routing/agent behaviour change — the concurrency-group fix is a no-op for real `on: issues` runs, affecting only the `workflow_dispatch` smoke path); the cost line degrades to "cost unavailable" if `claude-code-action`'s `execution_file` is absent/unparseable (e.g. a STUB run), so it can never break a live run; a cross-bump SigNoz dashboard is deferred (spec #13 — the spine-issue comment is the v1 ledger).

---

# Wave 2 — Agent A absorbs the helm values-diff (enrich carryover)

> **Goal:** re-home the one capability `helm-bump-enrich` had that Agent A lacked — the chart `values*.yaml` key-path diff with overridden-keys flagged (spec #2 / ADR-0068 "the helm values-diff survives as a helm-only extra"). Port the pure functions into the breaking-bump core, run them as a guarded workflow step on helm bumps, and tell Agent A to attach the result. **Must land before Wave 3 deletes `scripts/helm-enrich/`.**

## Task 2.1 — read the source to port

- [ ] Read `scripts/helm-enrich/valuesdiff.py` and `scripts/helm-enrich/test_valuesdiff.py` in full. The port is a **literal copy** — same `KeyChange` dataclass (`@dataclass(frozen=True)`, fields `path, kind, old, new, overridden=False`) + `flatten`/`diff_values`/`mark_overrides` (lists-as-leaves; `mark_overrides(changes, override_docs)` returns a *new* list of frozen `KeyChange`s). Only the module location changes (`scripts/helm-enrich/` → `scripts/breaking-bump/`) and a `__main__` CLI is appended. Do not retype or "improve" it; `cp`/`git show` the real file so the carryover is literal and the tests reusable.

## Task 2.2 — port `valuesdiff.py` + its tests into the breaking-bump core

- [ ] **Copy `scripts/helm-enrich/valuesdiff.py` to `scripts/breaking-bump/valuesdiff.py` UNCHANGED** — do not retype it. `cp`/`git show` the real file (it is `KeyChange`/`flatten`/`diff_values`/`mark_overrides`, `@dataclass(frozen=True)`, lists-as-leaves). The port is a literal copy; only the appended CLI is new.

```bash
cp scripts/helm-enrich/valuesdiff.py scripts/breaking-bump/valuesdiff.py
```

- [ ] **Append only** a `__main__` CLI block (and its imports) so the workflow can shell to it (the helm-enrich version was driven via `detect.py bundle`; the breaking-bump version is standalone). Add to the end of `scripts/breaking-bump/valuesdiff.py`:

```python


def main(argv: list[str] | None = None) -> int:
    import argparse
    import json
    import yaml

    p = argparse.ArgumentParser(prog="valuesdiff")
    p.add_argument("--old", required=True)
    p.add_argument("--new", required=True)
    p.add_argument("--overrides", action="append", default=[])
    args = p.parse_args(argv)
    old = yaml.safe_load(Path(args.old).read_text(encoding="utf-8"))
    new = yaml.safe_load(Path(args.new).read_text(encoding="utf-8"))
    overrides = [yaml.safe_load(Path(o).read_text(encoding="utf-8")) for o in args.overrides]
    changes = mark_overrides(diff_values(old, new), overrides)
    print(json.dumps([
        {"path": c.path, "kind": c.kind, "old": c.old, "new": c.new, "overridden": c.overridden}
        for c in changes
    ]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

(The CLI uses the real API verbatim — `mark_overrides(diff_values(...), [...])`, with `Path` already imported by the copied source. If the copied source did not import `Path`, add `from pathlib import Path` at the top of the file.)

- [ ] **Copy `scripts/helm-enrich/test_valuesdiff.py` to `scripts/breaking-bump/test_valuesdiff.py` verbatim** (it already does `import valuesdiff as vd` and exercises `vd.flatten`/`vd.diff_values`/`vd.mark_overrides` against `KeyChange` tuples — no edit needed since the module is on the same `sys.path`). Then **add one CLI test** at the end:

```bash
cp scripts/helm-enrich/test_valuesdiff.py scripts/breaking-bump/test_valuesdiff.py
```

```python


def test_cli_emits_json(tmp_path, capsys):
    old = tmp_path / "old.yaml"
    old.write_text("a:\n  b: 1\n")
    new = tmp_path / "new.yaml"
    new.write_text("a:\n  b: 2\n")
    rc = vd.main(["--old", str(old), "--new", str(new)])
    assert rc == 0
    import json
    out = json.loads(capsys.readouterr().out)
    assert out == [{"path": "a.b", "kind": "changed", "old": 1, "new": 2, "overridden": False}]
```

- [ ] Run both test files + the whole package:

```bash
cd scripts/breaking-bump && python -m pytest test_valuesdiff.py -v && python -m pytest -v
```

Expected: the copied source tests + the new `test_cli_emits_json` pass; whole package green.

## Task 2.3 — wire a guarded helm values-diff step into `agent-a`

> The step runs **only** for helm bumps (the dep's chart is under `infra/**/Chart.yaml`), computes the diff against the chart's `values*.yaml` (old = base ref, new = PR head), and writes `/tmp/valuesdiff.json`. Non-helm bumps skip it and the file is absent (Agent A's prompt handles "no values-diff"). For signoz: `infra/observability/Chart.yaml`, overrides in `infra/observability/values-prod.yaml` if present.

- [ ] In `.github/workflows/breaking-bump.yml`, in the `agent-a` job, the checkout must reach the Renovate branch tip and base. Change the `agent-a` checkout to `fetch-depth: 0` (it is currently `fetch-depth: 1`) and add the values-diff step **before** the `claude-code-action` step:

```yaml
      - name: Helm values-diff (helm bumps only)
        id: vdiff
        if: vars.BREAKING_BUMP_STUB != 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          DEP: ${{ needs.read-context.outputs.dep }}
          PR_NUMBER: ${{ needs.read-context.outputs.pr }}
        run: |
          set -euo pipefail
          # Find the chart this dep is bumped in from the Renovate PR's changed files.
          REN_REF=$(gh pr view "$PR_NUMBER" --json headRefName --jq .headRefName)
          git fetch origin "$REN_REF" main
          CHART=$(git diff --name-only "origin/main...origin/$REN_REF" \
                  | grep -E 'infra/.*/Chart\.yaml$' | head -n1 || true)
          if [ -z "$CHART" ]; then
            echo "::notice::no helm chart changed for $DEP — skipping values-diff."
            echo "helm=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          DIR=$(dirname "$CHART")
          VALUES=$(ls "$DIR"/values.yaml 2>/dev/null || true)
          if [ -z "$VALUES" ]; then
            echo "::notice::chart $CHART has no values.yaml — no values-diff."
            echo "helm=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          # --overrides is repeatable (argparse action="append"); one flag per file.
          OVERRIDE_ARGS=()
          for ov in "$DIR"/values-prod.yaml "$DIR"/values-*.yaml; do
            [ -f "$ov" ] && OVERRIDE_ARGS+=(--overrides "$ov")
          done
          git show "origin/main:$VALUES" > /tmp/values.old.yaml 2>/dev/null || echo '{}' > /tmp/values.old.yaml
          git show "origin/$REN_REF:$VALUES" > /tmp/values.new.yaml 2>/dev/null || cp "$VALUES" /tmp/values.new.yaml
          python scripts/breaking-bump/valuesdiff.py \
            --old /tmp/values.old.yaml --new /tmp/values.new.yaml \
            "${OVERRIDE_ARGS[@]+"${OVERRIDE_ARGS[@]}"}" > /tmp/valuesdiff.json
          echo "helm=true" >> "$GITHUB_OUTPUT"
          echo "::notice::values-diff written for $CHART"
```

- [ ] Validate the YAML parses and `agent-a` checkout is `fetch-depth: 0`:

```bash
python - <<'PY'
import yaml
d = yaml.safe_load(open('.github/workflows/breaking-bump.yml'))
steps = d['jobs']['agent-a']['steps']
co = next(s for s in steps if str(s.get('uses','')).startswith('actions/checkout'))
assert co.get('with', {}).get('fetch-depth') == 0, "agent-a checkout must be fetch-depth: 0"
assert any(s.get('name') == 'Helm values-diff (helm bumps only)' for s in steps), "no values-diff step"
print("agent-a values-diff wired, fetch-depth: 0 OK")
PY
```

Expected: `agent-a values-diff wired, fetch-depth: 0 OK`.

## Task 2.4 — tell Agent A to attach the values-diff

- [ ] Edit `.github/breaking-bump/prompts/agent-a.md`. After the "Also post a human-readable rendering to the spine issue" section, add:

```markdown
## Helm bumps only — attach the values-diff (carryover from ADR-0067)
If the file `/tmp/valuesdiff.json` exists, this is a helm chart bump and the
workflow has already computed the upstream default-values diff for you (you do
NOT compute it — you never read our code). Read it and append a **"Chart values
diff"** section to your spine-issue enrichment comment: list each changed
key-path, its old -> new default, and whether we override it (`overridden:
true`). Call out any **overridden** key whose upstream default moved — that is
where a silent behaviour change hides. This is a helm-only extra; if the file is
absent, skip this section entirely. It does NOT belong in the A->B JSON schema
(the schema stays strictly upstream + project-agnostic) — it is a human-readable
attachment on the issue only.
```

- [ ] Confirm the prompt mentions the values-diff:

```bash
grep -c "valuesdiff.json" .github/breaking-bump/prompts/agent-a.md
```

Expected: `1` (or more).

## Task 2.5 — commit Wave 2

```bash
git add scripts/breaking-bump/valuesdiff.py scripts/breaking-bump/test_valuesdiff.py \
        .github/breaking-bump/prompts/agent-a.md .github/workflows/breaking-bump.yml
git commit -s -m "feat(breaking-bump): port helm values-diff carryover into agent a"
```

(Subject 62 chars, lowercase-led, type `feat`, ASCII OK.)

> **Wave-2 PR body must:** name this the prerequisite for Wave 3's helm-enrich retirement (the values-diff would otherwise be lost); note Agent A still never reads our code — the diff is a deterministic workflow step fed in as data (preserves A's isolation); the A->B JSON schema is unchanged (the diff is a human-readable issue attachment, not schema data).

---

# Wave 3 — retire helm-bump-enrich into ADR-0068 (governance + de-wire)

> **Goal:** remove the double-fire (blocker #1) by deleting the predecessor enrichment workflows + scripts, and record the retirement in ADR-0067 + `INDEX.md` (registry coherence). After Wave 2 the values-diff is safe in Agent A, so this loses nothing. A signoz Renovate PR now fires the breaking-bump pipeline **only**.

## Task 3.1 — delete the helm-enrich workflows + scripts

- [ ] Remove the predecessor surface:

```bash
git rm .github/workflows/helm-bump-enrich.yml \
       .github/workflows/helm-bump-enrich-sweep.yml \
       .github/workflows/helm-enrich-tests.yml
git rm -r scripts/helm-enrich
```

- [ ] Confirm no remaining reference to the deleted paths (other than ADR-0067's history note, added next):

```bash
grep -rn "helm-enrich\|helm-bump-enrich" .github/ scripts/ renovate.json \
  | grep -v 'Binary' || echo "no live references to helm-enrich remain"
```

Expected: `no live references to helm-enrich remain` (the only matches should be ones you update in 3.3/3.4).

## Task 3.2 — update `renovate.json`'s helmv3 comment

- [ ] Edit `renovate.json`. The `helmv3` packageRule currently references ADR-0067. Change its `description` so it no longer points at the retired enrich workflow (it still keeps one-PR-per-tool, now for the breaking-bump pipeline):

Replace:
```json
      "description": "Helm subcharts under infra/ — one PR per tool (no grouping) so each bump is reviewed and enriched on its own (ADR-0067).",
```
with:
```json
      "description": "Helm subcharts under infra/ — one PR per tool (no grouping) so each bump is supervised on its own by the breaking-bump pipeline (ADR-0068).",
```

- [ ] Validate `renovate.json` still parses:

```bash
python -c "import json; json.load(open('renovate.json')); print('renovate.json OK')"
```

Expected: `renovate.json OK`.

## Task 3.3 — record the retirement in ADR-0067

- [ ] Edit `docs/adr/0067-internal-tool-upgrade-enrichment.md`. The Status line already says "Superseded by ADR-0068". Append a dated retirement note to the **Consequences** section (one paragraph, recording the executable removal — this is the "registries cannot lag" record, not a new decision):

```markdown

Retired 2026-06-12 (breaking-bump Plan 4): `helm-bump-enrich.yml`,
`helm-bump-enrich-sweep.yml`, `helm-enrich-tests.yml`, and `scripts/helm-enrich/**`
are removed now that Agent A (ADR-0068) carries the enrichment, with the helm
values-diff ported verbatim into `scripts/breaking-bump/valuesdiff.py`. This ADR
remains as the superseded record; the source registry `infra/tools-upgrade-sources.yaml`
(SigNoz, cert-manager, …) is kept and now governed by ADR-0068.
```

## Task 3.4 — update `docs/adr/INDEX.md` (registry coherence)

- [ ] Edit `docs/adr/INDEX.md`. **Remove** the two ADR-0067 rows that point at the now-deleted paths:

```
ADR-0067  .github/workflows/helm-bump-enrich*.yml   Enrichment workflow: advisory, ground notes in source registry
ADR-0067  scripts/helm-enrich/**                     Deterministic enrichment core; pure functions, pytest
```

Keep the `ADR-0067 infra/tools-upgrade-sources.yaml` row (the registry is retained) and all ADR-0068 rows. The `registry-coherence` gate requires INDEX.md to be in the diff whenever any `docs/adr/NNNN-*.md` changes — Task 3.3 touches `0067-*.md`, so this edit satisfies the gate.

- [ ] Confirm the deleted-path rows are gone and the registry row remains:

```bash
grep -n "helm-enrich\|helm-bump-enrich" docs/adr/INDEX.md && echo "STILL PRESENT (fix)" || echo "ADR-0067 deleted-path rows removed"
grep -q "ADR-0067  infra/tools-upgrade-sources.yaml" docs/adr/INDEX.md && echo "registry row kept OK"
```

Expected: `ADR-0067 deleted-path rows removed` then `registry row kept OK`.

## Task 3.5 — run the full Python suite (helm-enrich tests are gone; nothing should break)

```bash
cd scripts/breaking-bump && python -m pytest -v
```

Expected: green (the ported `test_valuesdiff.py` covers what `scripts/helm-enrich/test_valuesdiff.py` did).

## Task 3.6 — commit Wave 3

```bash
git add -A docs/adr/0067-internal-tool-upgrade-enrichment.md docs/adr/INDEX.md renovate.json
git commit -s -m "chore(breaking-bump): retire helm-bump-enrich into agent a"
```

(Subject 56 chars, lowercase-led, type `chore`, ASCII OK. The `git rm`s from 3.1 are already staged; `git add -A` stages the doc/config edits.)

> **Wave-3 PR body must:** state this removes the signoz double-fire (helm-enrich + dispatch both ran on `infra/observability/Chart.yaml`); confirm the values-diff carryover landed in Wave 2 so nothing is lost; note `registry-coherence` is satisfied (0067 ADR touched → INDEX.md touched); this is a single coherent workstream (delete + the governance record of the delete).

---

# Wave 4 — bound the lab (lower `prConcurrentLimit`)

> **Goal:** cap simultaneous Renovate PRs for the controlled rollout so the live experiment is bounded (spec #13: "lower it for the lab phase"). One reversible line.

## Task 4.1 — lower `prConcurrentLimit`

- [ ] Edit `renovate.json`. Change:

```json
  "prConcurrentLimit": 5,
```
to:
```json
  "prConcurrentLimit": 2,
```

> **Rationale (in the PR body):** 2 = one signoz pipeline can be in flight plus one unrelated trivial bump, without starving the queue; `prHourlyLimit: 1` already caps the rate. Blunt (it throttles *all* Renovate PRs repo-wide, including trivial ones that never enter the pipeline — spec #13's accepted caveat) but the right lab-phase lever. Reverts to 5 in one line once the pipeline is promoted past the lab.

- [ ] Validate `renovate.json` parses and the value changed:

```bash
python -c "import json; v=json.load(open('renovate.json'))['prConcurrentLimit']; assert v==2, v; print('prConcurrentLimit = 2 OK')"
```

Expected: `prConcurrentLimit = 2 OK`.

## Task 4.2 — commit Wave 4

```bash
git add renovate.json
git commit -s -m "chore(deps): lower prConcurrentLimit to 2 for breaking-bump lab"
```

(Subject 58 chars, lowercase-led, type `chore`, ASCII OK.)

> **Wave-4 PR body must:** name this a temporary lab-phase bound (spec #13), reversible to 5 on promotion, and note it throttles all Renovate PRs repo-wide (accepted caveat).

---

# Wave 5 — go-live runbook + maintainer go/no-go + first signoz run

> **Goal:** flip signoz LIVE. No pipeline code changes — the dispatcher already fires on signoz. This wave ships a runbook documenting preconditions, the **maintainer go/no-go checkpoint**, how to trigger/observe the first real run, success criteria per agent stage, and rollback. **DO NOT execute the live run without recorded maintainer approval.**

## Task 5.1 — write the go-live runbook

- [ ] Confirm the runbook directory exists (create if absent — `docs/superpowers/` already holds plans/specs):

```bash
ls docs/superpowers/runbooks/ 2>/dev/null || mkdir -p docs/superpowers/runbooks
```

- [ ] Create `docs/superpowers/runbooks/2026-06-12-breaking-bump-signoz-golive.md`:

```markdown
# Breaking-bump go-live runbook — signoz (first live dep)

> ADR-0068, spec #10 (first live test) + #13 (rollout strategy). This flips the
> breaking-bump pipeline LIVE on real `signoz` Renovate bumps. The pipeline is
> already built (Plans 1–3) and allowlist-gated to signoz-only. This runbook is
> the operational flip + the maintainer go/no-go gate.

## 1. Preconditions (verify ALL before go/no-go)

- [ ] `BREAKING_BUMP_STUB` repo variable is **unset or `false`** (else the
      pipeline runs stub fixtures, not real agents):
      `gh variable list | grep -i BREAKING_BUMP_STUB` — expect no row, or `false`.
- [ ] `CLAUDE_BOT_PAT` secret exists (fine-grained PAT, `workflows` write scope —
      required for Agent D's general correctness; signoz's helm/docs migration
      does not edit `.github/workflows/**`, so the `GITHUB_TOKEN` fallback works
      for THIS dep, but provision the PAT before deps that bump `actions/*`):
      `gh secret list | grep CLAUDE_BOT_PAT`.
- [ ] `CLAUDE_CODE_OAUTH_TOKEN` secret exists:
      `gh secret list | grep CLAUDE_CODE_OAUTH_TOKEN`.
- [ ] The 5 labels exist:
      `gh label list | grep -E 'ai-driven|breaking-bump|ai-cleared|needs-human|post-bump-enhancement'`
      — expect 5 rows. If missing, run the `breaking-bump-labels` workflow
      (`gh workflow run breaking-bump-labels.yml`).
- [ ] The allowlist is signoz-only: `cat scripts/breaking-bump/allowlist.yaml`
      — expect `deps: [signoz]`.
- [ ] `helm-bump-enrich.yml` is gone (Wave 3): `ls .github/workflows/ | grep helm-bump-enrich`
      — expect nothing (no double-fire).
- [ ] `prConcurrentLimit` is 2 (Wave 4):
      `python -c "import json;print(json.load(open('renovate.json'))['prConcurrentLimit'])"`.

## 2. MAINTAINER GO/NO-GO

This is a live, token-spending, PR-mutating automation on production dependency
bumps. **The maintainer records an explicit GO here before any live run.** The
pipeline's irreversible side-effect is Agent D *closing the Renovate PR* and
opening a claude PR; everything before D is recoverable (the Renovate PR stays
open). The human merge of the claude PR remains the safety net (spec decision #6).

Record: `GO` / `NO-GO`, date, who, and any scope caveat.

## 3. Trigger the first live run

Two paths — prefer the natural one:

**A. Natural (issue-label-driven, the real path):** wait for Renovate to open the
next `signoz` bump PR (e.g. `0.122.0 -> 0.128.0` on `infra/observability/Chart.yaml`).
The dispatcher (`breaking-bump-dispatch.yml`, `on: pull_request`) fires
automatically: allowlist-gate (signoz ✓) -> route (`0.x` minor -> pipeline) ->
create the spine issue -> `breaking-bump.yml` (`on: issues`) runs A -> B<->C -> D.
To force the bump now: `gh workflow run renovate.yml` (or trigger Renovate from
its dashboard) so it opens the signoz PR.

**B. Hand-driven (smoke test without waiting for Renovate):** the
`breaking-bump.yml` `workflow_dispatch` path runs the pipeline against an existing
spine issue number:
`gh workflow run breaking-bump.yml -f issue_number=<N>`. Use this only against a
*scratch* spine issue (a real Renovate PR # in its context block) to rehearse;
the natural path is the live test of record.

## 4. Observe each stage (on the spine issue + the Actions run)

| Stage | Success looks like | Where to watch |
|---|---|---|
| Step 0 dispatch | spine issue created, labels `ai-driven`+`breaking-bump`, context block in body | the new issue + `breaking-bump-dispatch` run |
| Agent A | enrichment comment cites real signoz release URLs; A->B schema valid; "Chart values diff" section present (helm carryover) | spine issue comment + `agent-a` job log + spend line |
| B rates A | not escalated to `needs-human` at Gate A (rating high/medium) | spine issue; `b_round1` log |
| B<->C loop | converges (C `approved: true`) within ≤6 rounds; each round comments | spine issue round comments |
| plan-approved | non-empty plan -> `dispatch_d=true`; OR `(a)+(b)` empty -> `ai-cleared` + issue closed (signoz `Chart.yaml:19` stale pin is a real category-(b) doc fix, so expect dispatch_d) | `plan-approved` job |
| Agent D | claude PR `chore/claude-signoz-v<to>` opened FIRST; Renovate PR then closed with a link; `(c)` issue filed if any | the claude PR + the closed Renovate PR |
| §6a | runs on the claude PR (suppressed on `renovate/*`), not on the Renovate branch | the claude PR checks |
| spend | per-stage spend lines accumulate on the spine issue (Wave 1) | spine issue |

**Expected for signoz `0.122.0 -> 0.128.0`** (spec #10): a real `0.x`-minor that
exercises the deterministic route + `0.x` semver handling + the helm values-diff;
low blast radius (observability backend); won't early-exit (the stale pin comment
`Chart.yaml:19` "0.122.0 ships SigNoz app v0.122.0 — initial pin" is a concrete
category-(b) doc-coherence fix), so D opens a (docs-ish) claude PR.

## 5. Success criteria

- The spine issue tracks the whole run; the claude PR is open, review-ready, and
  links the (now-closed) Renovate PR bidirectionally.
- No automated job pushed to the `renovate/*` branch (the root-cause invariant).
- Per-stage spend is visible on the issue and within the "watch with eyes open"
  expectation (no hard budget).
- The claude PR's diff is the version bump (preserved from Renovate's commit) +
  D's migration commits (the stale-pin doc fix).

## 6. Rollback / kill switch (no code revert needed)

- **Instant dark kill:** `gh variable set BREAKING_BUMP_STUB --body true` — every
  agent step re-stubs; live token spend stops immediately (spec #13 dark feature
  flag = kill switch). Unset to resume.
- **Stop new pipelines without touching in-flight ones:** empty the allowlist —
  edit `scripts/breaking-bump/allowlist.yaml` to `deps: []` and merge; the
  dispatcher short-circuits before any Claude call. (signoz-only is already the
  minimum; this takes it to zero.)
- **A run misbehaves mid-flight:** if it escalated, the spine issue carries
  `needs-human` + the failed stage; pick it up manually (the Renovate PR is still
  open if the failure was pre-D). If post-D, the claude PR is a normal PR — take
  it over or close it.
- **Renovate PR wrongly closed + claude PR dead (doubly-orphaned):** re-tick
  "Recreate this PR" on the Renovate Dependency Dashboard (spec #6 resurrection);
  the spine issue stays open with `needs-human`.

## 7. After a clean first run

Per the maintainer's "pause after a training round" discipline: **stop here.**
Do not auto-expand the allowlist to the next dep (helm v4 / #814, spec #10 live
test 2) without a fresh maintainer GO. The allowlist is a confidence ratchet —
one observed dep at a time.
```

## Task 5.2 — confirm no pipeline code changed this wave

```bash
git status --porcelain | grep -vE 'docs/superpowers/runbooks/' && echo "UNEXPECTED non-runbook change (review)" || echo "runbook-only wave OK"
```

Expected: `runbook-only wave OK`.

## Task 5.3 — commit Wave 5

```bash
git add docs/superpowers/runbooks/2026-06-12-breaking-bump-signoz-golive.md
git commit -s -m "docs(breaking-bump): add signoz go-live runbook + go/no-go gate"
```

(Subject 62 chars, lowercase-led, type `docs`, ASCII OK.)

> **Wave-5 PR body must:** state this is the live-flip wave with a hard maintainer
> go/no-go (do not merge-and-run without recorded approval); no pipeline code
> changes; rollback is the dark `BREAKING_BUMP_STUB` kill switch + emptying the
> allowlist (no revert); after a clean run, pause — do not auto-expand the
> allowlist (confidence ratchet).

---

## Final verification (run before opening each wave's PR)

- [ ] Whole Python package green:

```bash
cd scripts/breaking-bump && python -m pytest -v
```

- [ ] The pipeline workflow parses and (post-Wave-1) every agent job reports spend:

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/breaking-bump.yml')); print('pipeline yaml OK')"
```

- [ ] (Post-Wave-3) no live helm-enrich references remain:

```bash
ls .github/workflows/ | grep helm-bump-enrich && echo "STILL PRESENT" || echo "helm-enrich removed OK"
test -d scripts/helm-enrich && echo "scripts/helm-enrich STILL PRESENT" || echo "scripts/helm-enrich removed OK"
```

- [ ] (Post-Wave-3) registry coherence — 0067 deleted-path rows gone, registry row kept:

```bash
grep -E "ADR-0067.*helm-enrich|ADR-0067.*helm-bump-enrich" docs/adr/INDEX.md && echo "FIX: stale rows" || echo "INDEX.md coherent"
```

---

## Spec-coverage map (self-review)

| Spec item | Plan-4 coverage |
|---|---|
| Rollout: signoz first, allowlist as confidence ratchet (#13 / Rollout strategy) | Wave 5 runbook §1/§7 (allowlist already signoz-only; do not auto-expand) |
| Flip signoz live — identify the gates holding it back | "What actually holds signoz back" section + Wave 3 (double-fire) + Wave 5 (`BREAKING_BUMP_STUB`, PAT) |
| `CLAUDE_BOT_PAT` secret precondition (workflows scope) (Prerequisites #3) | Deployment preconditions + Wave 5 runbook §1 |
| Lower `prConcurrentLimit` for the lab (5 -> 2–3) (#13) | Wave 4 (-> 2) |
| End-to-end live run on a real signoz bump; observe each stage (#10) | Wave 5 runbook §3/§4/§5 |
| Rollback if it misbehaves (#13 dark flag = kill switch) | Wave 5 runbook §6 (`BREAKING_BUMP_STUB=true`, empty allowlist) |
| Absorb/retire helm-bump-enrich into Agent A (#2/#8/#12; ADR-0067 superseded) | Wave 2 (values-diff carryover) + Wave 3 (delete workflows/scripts) |
| Helm values-diff survives as a helm-only extra (#2) | Wave 2 `valuesdiff.py` port + `agent-a` step + prompt |
| ADR-0067 superseded; INDEX.md / registry coherence (#12) | Wave 3 (0067 retirement note + INDEX.md row removal) |
| Spend observability (token/cost), not a hard budget (#13) | Wave 1 `spend.py` + per-stage spine-issue comments |
| §6a suppressed on `renovate/*` | already on `main` (verified — `claude-code-review.yml:53`); no Plan-4 work |
| First live test = signoz `0.122.0 -> 0.128.0`, won't early-exit (stale pin) (#10) | Wave 5 runbook §4 expected-behaviour note |

---

## Flagged ambiguities + live-safety checkpoints (not silently guessed)

1. **LIVE-SAFETY CHECKPOINT — Wave 5 is gated on a recorded maintainer go/no-go.**
   This plan flips a live, token-spending, PR-mutating automation onto production
   dependency bumps. Waves 1–4 are safe to land autonomously (observability,
   carryover, retirement, an inflow cap — none fire a live agent run). **Wave 5
   must not merge-and-run without explicit maintainer approval** (runbook §2). The
   whole plan is itself gated on maintainer approval before execution per the task.

2. **`claude-code-action@v1` cost source — verified (Wave 1).** The action exposes
   **no** direct token/cost step output; its outputs are `execution_file`,
   `branch_name`, `github_token`, `structured_output`, `session_id` (verified
   against the action's `action.yml`). `execution_file` is a path to a JSON-array
   execution log whose single `type=="result"` entry carries `total_cost_usd` (a
   USD float — `0.0347` in the action's `test/fixtures/sample-turns.json`, with no
   token-count field on the result entry). `spend.py` reads that and renders
   `$0.0347`; a None/missing/unparseable path or absent result entry (e.g. a STUB
   run with no `execution_file`) renders "cost unavailable" and never breaks the
   run. No runtime guessing remains.

3. **The `valuesdiff.py` port is a literal `cp` of the SOURCE (Wave 2).** The plan
   no longer embeds a re-typed listing — Task 2.2 instructs `cp`-ing
   `scripts/helm-enrich/valuesdiff.py` (verified `KeyChange`/`flatten`/`diff_values`/
   `mark_overrides`, `@dataclass(frozen=True)`, lists-as-leaves) and `cp`-ing its
   test file verbatim, then appending **only** a `main()` CLI + one CLI test. There
   is no divergence risk because nothing is retyped; the source is the proven
   behaviour and it is copied byte-for-byte.

4. **The values-diff workflow step assumes signoz's chart layout
   (`infra/observability/{Chart.yaml,values.yaml,values-prod.yaml}`).** The step
   derives the chart dir from the Renovate PR's changed `Chart.yaml` and globs
   `values*.yaml`, so it generalises — but if `infra/observability/` has no
   `values.yaml` (only `values-prod.yaml`), the step skips the diff (logs a notice)
   rather than failing. Confirmed `infra/observability/Chart.yaml` exists; the
   values-file presence should be verified during Wave 2 (the step degrades safely
   if absent — Agent A just omits the section).

5. **`prConcurrentLimit: 2` is a judgment pick within the spec's "2–3" range.**
   Chose the tighter bound for the lab; trivially adjustable to 3 if the queue
   starves. Reversible one-liner.

6. **Cross-bump spend dashboard is deferred (not in scope).** The spec says
   "spend observability, not a hard budget" and "surface per-bump cost as a comment
   on the spine issue" — Wave 1 does exactly that. A SigNoz/ClickHouse aggregation
   across bumps would need an exporter `claude-code-action` does not provide; per
   spec #13 (deferred hard-budget) it is YAGNI until the per-bump numbers surprise
   us. Stated rather than silently built.

7. **Concurrency-group quirk in `breaking-bump.yml` — Fixed in Wave 1.**
   The pipeline's `concurrency.group` was `breaking-bump-issue-${{ github.event.issue.number }}`,
   which is empty under `workflow_dispatch` (Plan 3 OPEN QUESTION 1 accepted this
   for `on: issues`). Wave 1 (Task 1.0) adds a 1-line `|| github.event.inputs.issue_number`
   fallback so a hand-driven smoke test (runbook §3 path B) gets a proper per-issue
   slot. For real `on: issues` runs `github.event.issue.number` is set, so the group
   is UNCHANGED — no live-behaviour change; the fix only affects the
   `workflow_dispatch` smoke path.
```