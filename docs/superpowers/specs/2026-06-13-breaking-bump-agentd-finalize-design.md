# Breaking-bump Agent-D — deterministic finalize + PR-exists gate — design

## Status
Draft for maintainer review.

## Problem

The 2026-06-13 helm acceptance re-run (spine #863, run 27459670453) **converged in 1 round** (the B'/amend + create-mode fix worked) and `agent-d` ran green — but produced **no migration PR**, never pushed the fork branch, and left Renovate PR #814 open. The run reported success and nothing escalated.

Root cause, confirmed in `breaking-bump.yml`:

- The deterministic push → `gh pr create` → `gh pr view` (verify) → close lives **only in the `STUB Agent D` step** (`if: … vars.BREAKING_BUMP_STUB == 'true'`), which is skipped on live runs.
- In **live (LLM) mode**, the `Run Agent D (implementer)` step delegates *all* of push/PR/verify/close to the agent ("implement, commit, push, open the claude PR, confirm it exists, THEN close the Renovate PR").
- After that step there is only the non-fatal spend-ledger step. **No step verifies the claude PR exists.** The agent ran 23 turns, `is_error:false`, `subtype:success`, 0 permission denials, yet never pushed/opened the PR. Because the *job* succeeded, the `escalate` job (which fires only on `contains(needs.*.result, 'failure')`) never triggered. The flake was invisible.

Contributing bug: `identity.claude_branch(dep, to)` returns `f"chore/claude-{dep}-v{to}"`, but `to` already carries a `v` for some deps (`v4.2.1`) → `chore/claude-helm-vv4.2.1` (double `v`). Signoz worked because its `to` was `0.128.0` (no `v`); `test_identity` only covers no-`v` versions, so it was never caught.

## Goals

- A converged run **reliably opens the migration PR** (and closes the Renovate PR), independent of LLM diligence on mechanical git ops.
- A run that *fails* to produce the PR **escalates to `needs-human`** instead of passing silently.
- Branch names are correct for `v`-prefixed versions.

## Non-goals

- Changing Agent A, the B↔C loop, the confidence gate, or the convergence behavior (all validated).
- Changing what the migration *contains* — that is still the LLM's judgment (implement the approved plan).

## Design

### §1. Deterministic finalize step (mechanical ops leave the LLM)

The LLM's job shrinks to **implement the approved plan (a)+(b), `git commit -s`, and file the (c) post-bump-enhancement issue**. The mechanical, verifiable operations move to a new deterministic step that runs **after** the implementer in **live mode** (`if: steps.rev.outputs.skip == 'false' && vars.BREAKING_BUMP_STUB != 'true'`), mirroring the stub step:

1. **Assert the agent produced a commit** — `git rev-list --count "$REN_OID..HEAD"` (or compare to the Renovate tip captured in the `rev` step). Zero new commits → `::error::Agent D produced no migration commit` + `exit 1` (→ `escalate` → `needs-human`).
2. **Push** — `git push -u origin "$CLAUDE_BRANCH"` (idempotent; the `rev` step's existing idempotency guard already short-circuits if a claude PR exists).
3. **Open the PR** with `GH_TOKEN: ${{ secrets.CLAUDE_BOT_PAT || secrets.GITHUB_TOKEN }}` so it triggers CI/§6a: `gh pr create --base main --head "$CLAUDE_BRANCH" --title "fix(<ctx>): migrate $DEP $FROM → $TO" --body "Migrates #$PR_NUMBER. Closes #$ISSUE_NUMBER."` (title scope: reuse the agent's commit subject if available, else a deterministic default).
4. **Verify it exists** — `gh pr view "$CLAUDE_BRANCH" >/dev/null` (exit 1 → escalate).
5. **Close the Renovate PR** — `gh pr close "$PR_NUMBER" --comment "Superseded by <claude PR url>."`

The agent's `--allowed-tools` no longer needs `gh pr create`/`gh pr close` (it only implements + commits + `gh issue create` for the (c) item). The existing `STUB Agent D` step stays for stub runs; the new step is its live twin.

### §2. `agent-d.md` prompt

Rewrite to: implement (a)+(b) from `./plan.json` on the already-checked-out `$CLAUDE_BRANCH`, run any relevant build/lint, `git commit -s`, and file the (c) post-bump-enhancement issue. **Stop there** — do NOT push, open the PR, or close the Renovate PR (the workflow's deterministic finalize step does that). This removes the failure surface where the agent forgets/flakes the mechanical steps.

### §3. Fix `identity.claude_branch` double-`v`

Normalize the version: strip a single leading `v` from `to` before the template, so the `v` is applied exactly once.

```python
def claude_branch(dep: str, to: str) -> str:
    """Agent D's fork branch; chore/claude- prefix passes branch-name.yml."""
    v = to[1:] if to[:1] == "v" else to
    return f"chore/claude-{_safe(dep)}-v{v}"
```

Add `test_identity` cases: `claude_branch("helm", "v4.2.1") == "chore/claude-helm-v4.2.1"` and confirm the existing no-`v` cases still hold.

## Testing

- **Unit:** `identity.claude_branch` with a `v`-prefixed `to` (and the existing no-`v` cases). The finalize step's commit-exists gate is shell logic — covered by the live re-run, not unit-testable.
- **Acceptance:** re-run the helm 3.21→4.2.1 bump; it must now **open the migration PR** (and close #814), or — if the agent produces no commit — **escalate to needs-human** rather than passing green.

## ADR impact

Small. Add one line to the existing ADR-0068 "Amendment 2026-06-13" (or a short new note): Agent D's push/PR/verify/close is deterministic and gated (live mode no longer trusts the LLM for mechanical ops; a missing PR escalates).

## Scope

One workstream / one PR: this spec, the `identity.py` fix + test, the `breaking-bump.yml` finalize step + agent-d `allowed-tools` trim, the `agent-d.md` prompt rewrite, and the ADR-0068 line. No schema change, no cross-context surface.

## Resolved decisions

1. **PR title:** reuse the agent's commit subject (`git log -1 --format=%s` on `$CLAUDE_BRANCH`) as the PR title, so the agent's bounded-context scope choice is preserved; fall back to `fix(infra): migrate <dep> <from> → <to>` only if there is no commit subject (which can't happen, since the commit-exists gate already failed the run in that case).
2. **Build/test before PR:** left to the claude PR's own CI — the finalize step is purely git/PR mechanics. The PR is opened with `CLAUDE_BOT_PAT` so the full gate (including §6a) runs on it.
