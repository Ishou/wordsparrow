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
To force the bump now (Renovate runs as a GitHub App, not a repo workflow):
check the signoz row on the Renovate **Dependency Dashboard** issue, or wait for
its next scheduled run, so it opens the signoz PR.

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
| Agent A | enrichment comment cites real signoz release URLs; A->B schema valid; "Chart values diff" section present (helm carryover) | spine issue comment + `agent-a` job log + spend-ledger line |
| B rates A | not escalated to `needs-human` at Gate A (rating high/medium) | spine issue; `b_round1` log |
| B<->C loop | converges (C `approved: true`) within ≤6 rounds; each round comments | spine issue round comments |
| plan-approved | non-empty plan -> `dispatch_d=true`; OR `(a)+(b)` empty -> `ai-cleared` + issue closed (signoz `Chart.yaml:19` stale pin is a real category-(b) doc fix, so expect dispatch_d) | `plan-approved` job |
| Agent D | claude PR `chore/claude-signoz-v<to>` opened FIRST; Renovate PR then closed with a link; `(c)` issue filed if any | the claude PR + the closed Renovate PR |
| §6a | runs on the claude PR (suppressed on `renovate/*`), not on the Renovate branch | the claude PR checks |
| spend | per-stage spend lines accumulate in ONE running "spend ledger" comment on the spine issue, edited in place (Wave 1) | spine issue |

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
