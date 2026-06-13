# Breaking-bump plan → AI execution contract — design

## Status
Draft for maintainer review. §3 (workflow sensitivity) resolved with the maintainer + a trigger audit. Intersects the active ADR-0068 prompt-injection hardening waves (A #865, B #866 scope gate, C #871) — W2 edits `scope_gate.py` + agent prompts those waves also touch, so expect rebases.

## Problem

The helm v3.21.0→v4.2.1 migration converged and implemented correctly, but the **post-D scope gate** (#866) rejected it, so no migration PR opened. Two root causes, both stemming from one design flaw: **`plan.json` is shaped as a human migration narrative, but its consumers are machines** — the AI implementer (agent-d) that must execute it faithfully, and the deterministic scope gate that must check the diff against it.

1. **No authoritative scope.** `scope_gate.referenced_paths()` reverse-engineers the allowed file set by **regex-grepping file mentions out of B's free-text** `(a)+(b)` items. So "scope" is whatever paths happen to appear in the prose. agent-d touched `infra/observability/README.md` (to "fix the helm prereq"); B's prose never named it; the gate flagged it out-of-plan. Neither side had an authoritative contract.

2. **Over-reach the plan invited.** A human reading "update the helm prereqs" applies judgment (a `helm ≥ 3.16` *minimum floor* is already satisfied by v4 — leave it alone; only a hard pin / install URL / removed-or-renamed flag is genuinely stale). An AI reads it as "go change helm-version mentions" and edits satisfied `≥` floors it shouldn't. The plan doesn't encode the *must-change-vs-leave-alone* distinction.

3. **(Separate, blocking) `.github/workflows/` is blanket-sensitive.** `scope_gate._SENSITIVE` marks **all** of `.github/workflows/` never-touch. But a CLI-tool / `uses-with` migration (helm, actions) *must* edit workflow files — that is where the version pins and removed flags live. As written, #866 makes workflow-based migrations impossible regardless of the plan. (signoz didn't hit this — it touched `Chart.yaml`/values, not workflows.)

## Goals

- `plan.json` is an **execution contract for an AI**: an explicit, closed file-scope manifest + per-item change-type + justification — so agent-d executes faithfully *within bounds* and the scope gate checks against an authoritative list, not grepped prose.
- B only lists version references that are *genuinely wrong under the new major*; satisfied `≥` floors stay untouched.
- The scope gate can pass a legitimate workflow-touching migration **without** weakening the injection threat model.

## Non-goals

- Pre-writing the diff. The contract binds **scope + intent** (which files, what change-type, why); agent-d still owns the **exact edits** (line changes, build fixes, adapting to real file content). Over-specifying turns agent-d into a rubber stamp and forfeits the implementer's value.
- Changing convergence, Agent A, finalize, or push-auth (all validated).

## Design

### §1. `plan.json` gains a structured scope manifest

Add two machine-consumable fields alongside the existing `a`/`b`/`c`/`dispositions`/`_amendments`:

```json
{
  "a": ["… mandatory step prose (unchanged, human-readable) …"],
  "b": ["… doc-coherence step prose …"],
  "c": ["… opportunistic (not in PR) …"],
  "scope": {
    "files": [
      { "path": ".github/workflows/deploy-api-k8s.yml", "change": "remove --show-resources flag (removed in v4)" },
      { "path": "docs/local-development.md", "change": "replace get-helm-3 install URL (installs v3)" }
    ]
  },
  "dispositions": { "...": "..." },
  "_amendments": { "removed": [] }
}
```

`scope.files[]` is the **authoritative, closed set** of files this migration may touch, each with a one-line `change` intent. It is the contract the gate checks and agent-d obeys. The `a`/`b` prose stays for human readability; `scope.files` is the machine truth.

### §2. Agent B rubric — emit the manifest + the must-change rule

`agent-b.md` gains, in the plan step:
- **Build `scope.files` explicitly** — every file the migration touches, with a one-line `change`. This is authoritative; if it's not in `scope.files`, agent-d may not touch it.
- **The version-reference rule (the ≥-floor distinction):** only schedule a version reference for change when it is genuinely wrong under the new major — a **hard pin** (`version: vX`), an **install script/URL** (`get-helm-3`), or a **removed/renamed flag or env**. A **minimum floor that the new major already satisfies** (`helm ≥ 3.16`, `node >= 18`) is **not** stale — leave it. State this as an explicit checklist item so B neither lists spurious floor-bumps nor omits real ones.
- AMEND mode (B') carries `scope.files` forward under the same monotonicity rule as dispositions (an entry leaves only via `_amendments.removed`).

### §3. Scope gate — check against the manifest; reconcile sensitive paths

`scope_gate.py`:
- **Authoritative scope:** replace `referenced_paths()` (prose grep) with reading `plan["scope"]["files"][].path`. `evaluate()` fails any changed file not in that exact set. (Keep a fallback to the prose-grep only if `scope.files` is absent, for backward-compat during rollout.)
- **Sensitive-path reconciliation (resolved 2026-06-13, verified):** split `_SENSITIVE` by threat profile. **Keep always-blocked regardless of scope:** `.env`, `secret`, `credential`, `htpasswd` — the harm is *leak-on-commit* (committing a secret value exposes it the moment the branch is pushed, merged or not). **Remove `.github/workflows/**` from the sensitive set** — the harm there is *execute-on-merge*, which is fully contained for a PR-opening agent: (1) `scope.files` already blocks off-plan workflow touches; (2) the claude PR is reviewed by §6a + a human before merge; (3) GitHub uses the **base branch's** workflow definitions for `pull_request` events, so a workflow modified in the PR cannot self-execute via the PR's own CI; (4) **verified** — every `push:`/`workflow_run` trigger in this repo is `branches: [main]`, so agent-d's branch push executes nothing. A modified workflow only runs after a human merges it. So a declared, in-scope workflow edit is just normal reviewed code; only off-plan or secret-path touches are blocked. (This reverses part of #866's workflow block — coordinate with the hardening waves, but the threat analysis + trigger audit support it.)

### §4. Agent D — obey the manifest

`agent-d.md`: implement the approved plan, but **touch only files in `plan.scope.files`** — do not "improve" docs or bump version references outside the declared set, even if they look stale (the planner already applied the ≥-floor rule). If you believe a needed file is missing from scope, STOP and surface rather than touching it (the run escalates; a human or a re-plan adds it).

### §5. Agent C — review the manifest

`agent-c.md`: in addition to completeness, verify (a) `scope.files` covers every change the plan's `a`/`b` items imply (no missing files → agent-d won't be forced out of scope), and (b) no `scope.files` entry is a spurious satisfied-floor bump (apply the §2 rule). C's approval certifies the contract, not just the prose.

## Testing

- **Unit (`test_scope_gate.py`):** `evaluate()` reads `scope.files` (in-scope path passes; out-of-scope fails; always-sensitive path fails even if in scope; a workflow path passes iff in scope, fails if not); manifest-absent falls back to prose-grep.
- **Acceptance:** re-run helm 3.21→4.2.1 — agent-d's diff must be ⊆ `scope.files`, the scope gate passes, finalize opens the migration PR. (LLM loop — proven by the live re-run, not CI.)

## ADR impact

Amend ADR-0068: the B↔C output is an execution contract (authoritative `scope.files`), the scope gate checks the manifest, and the workflow-sensitive-path policy is scope-gated (resolved 2026-06-13). Touch `docs/adr/INDEX.md` in the same PR (coherence gate).

## Wave decomposition

- **W1** — this spec + ADR-0068 amendment + INDEX.md (governance). Includes the §3 sensitive-path decision, resolved with the hardening owner.
- **W2** — implementation: `plan.json` `scope.files` (agent-b.md emits, agent-c.md reviews, agent-d.md obeys), `scope_gate.py` manifest-based check + reconciled sensitive policy + `test_scope_gate.py`, the ≥-floor rubric in agent-b.md. Then the live helm re-run.

## Open questions

1. **Backward-compat window** — keep the prose-grep fallback when `scope.files` is absent, or hard-require the manifest once agent-b.md emits it? Recommend fallback for one rollout, then require.

## Resolved decisions

- **§3 sensitive-path policy (2026-06-13, verified):** `.github/workflows/**` removed from `_SENSITIVE` (execute-on-merge harm is contained by scope.files + review-before-merge + main-only triggers — verified no branch-arbitrary `push`/`workflow_run` exists); `.env`/secrets/credentials/htpasswd stay always-blocked (leak-on-commit). Coordinate the change with the active injection-hardening waves since it edits their `scope_gate._SENSITIVE`.
