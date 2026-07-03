# Perf edge-caching rollout — Orchestration Procedure (cron-driven)

Cron-fired tick procedure for the perf edge-caching multi-PR rollout
(plan: `docs/superpowers/plans/2026-07-03-perf-edge-caching-rollout.md`,
analysis: `docs/superpowers/plans/2026-07-03-query-timings-perf-analysis.md`).

**Cron schedule:** `*/2 * * * *` (every 2 minutes).

**CWD:** run from the repo root (`cd "$(git rev-parse --show-toplevel)"`).

**State source of truth:** `docs/superpowers/plans/2026-07-03-perf-edge-orchestration-log.md`.

If this procedure or the plan is not on `origin/main` yet, read both from the
bootstrap branch: `git show origin/docs/perf-edge-orchestration:<path>`.

## Standing maintainer authorization (recorded 2026-07-03)

- Maintainer approved the 9-PR wave plan and dispatch in-session ("go", 2026-07-03),
  including the standard auto-merge-on-green+LGTM authority for every PR in this rollout.
- Standing 400-line grant (recorded 2026-05-22, reinforced 2026-05-25): "for the 400
  line-cap: i grant you explicit authorization to by-pass it if you deem it necessary,
  the 400 line-cap should trigger a question about 'should the PR be split?' but it does
  not mean that it should always be the case" / "the 400 cap MAY be by-passed by YOUR
  call even without my call". Orchestrator invokes the ADR-0001 §4 soft-target override
  proactively; pre-flagged below for Phase 8.
- §6a LGTM gate: the bot posts a COMMENTED review starting "LGTM" — gate on latest
  bot-review body + green blocking checks + `mergeStateStatus` CLEAN, not on APPROVED.

## Phase map

| Phase | Wave | Branch | Base | PR title prefix | Scope (plan section) |
|---|---|---|---|---|---|
| 0 | — | `docs/perf-edge-orchestration` | main | `docs(plans): perf edge rollout docs` | Bootstrap PR: analysis, plan, this procedure, log. Standard 3a handling. |
| 1 | 1 | `docs/adr-0089-api-edge-cloudflare` | main | `docs(adr): ADR-0089 api edge` | ADR-0089 + INDEX.md rows (plan "Wave 1"). Docs read from Phase-0 branch if unmerged. |
| 2 | 2 | `feat/frontend-preconnect-daily-prime` | main | `feat(frontend): preconnect + eager daily prime` | Plan "PR 2". |
| 3 | 2 | `feat/frontend-whoami-staleness-gate` | main | `feat(frontend): whoami staleness gate` | Plan "PR 3". |
| 4 | 2 | `feat/grid-daily-cache-headers` | main | `feat(grid-api): daily cache headers + etag` | Plan "PR 4". |
| 5 | 2 | `fix/timing-allow-origin-headers` | main | `fix(infra): timing-allow-origin across services` | Plan "PR 5". Cross-cutting single workstream (identical line ×5 modules). |
| 6 | 3 | `fix/orange-cloud-grid-identity` | main | `fix(infra): orange-cloud grid + identity` | Plan "PR 6". |
| 7 | 3 | `feat/terraform-daily-cache-rule` | main | `feat(infra): cloudflare daily cache rule` | Plan "PR 7". Sequenced after Phase 6 merges. |
| 8 | 3 | `feat/grid-worker-regen-purge` | main | `feat(grid-worker): regen cli + edge purge` | Plan "PR 8". Sequenced after Phase 7 merges. **Cap pre-flag:** instruct implementer to cite the §4 soft-target override in the PR body from the first push if the diff (CLI wiring + purge client + Job template + tests + secrets doc) lands past 400. |
| 9 | 4 | `fix/grid-hikari-pool-10` | main | `fix(grid-api): hikari pool 10` | Plan "PR 9". |
| 10 | 4 | — (no PR) | — | — | File the plan's 6 deferred issues via `gh issue create --label status:idea` (titles + bodies from plan "Issues to file"); then end condition. |

Wave gating: Phase 1 dispatches once Phase 0 is OPEN (docs-only sibling; ADR content is
independent). Phases 2–5 dispatch together in ONE tick once Phase 1 is MERGED. Phase 6
dispatches once ALL of 2–5 are MERGED. 7 after 6; 8 after 7; 9 + 10 after 8.

## Tick procedure

1. `cd "$(git rev-parse --show-toplevel)" && git fetch origin --quiet`.
2. Walk the phase map in order; find the first phase not yet MERGED.
   - **MERGED** → continue to next phase.
   - **CLOSED-not-merged** → escalate: append ACTION to log, `CronDelete` self, exit.
   - **OPEN** → assess with the open-PR decision tree below; take at most one action.
   - **No PR yet, gate satisfied** → dispatch this phase's implementer (Phases 2–5: dispatch
     all four in this one tick; that is one logical action). Log it.
   - **No PR yet, gate not satisfied** → wait.
3. Exactly one action per tick (a Wave-2 batch dispatch counts as one). Log every action.

### Open-PR decision tree (apply top-down, act on first match)

- **3a. Ready to merge.** All blocking checks SUCCESS (`ci`/build, `commitlint`,
  `branch-name`, `dco`, `secret-scan`/gitleaks, `dependency-review`, `openapi-lint`,
  `openapi-typescript-drift`, `helm-lint`, `api-chart-lint`, `readme-diagrams-drift`,
  `registry-coherence` — whichever run for the paths) AND `mergeable: MERGEABLE` AND
  `mergeStateStatus != BLOCKED` AND latest review body starts with `LGTM`
  (case-insensitive), or the only outstanding finding is the 400-line target with the
  override cited in the body. → `gh pr merge <pr#> --squash` (NO `--delete-branch`).
- **3b. Auto-loop alive.** `claude-review` IN_PROGRESS/QUEUED or a Claude Code Review
  workflow run on the branch within 15 min → wait. Do NOT race the auto-fixer.
- **3c. Findings + no fixer activity.** Latest review starts `Findings`, no review
  workflow running, no commit since the review. Apply the identical-finding
  loop-terminator first (same rule + same location + same fix-shape as prior cycle →
  400-line case: body-edit fixer citing the override + fresh manual reviewer; any other
  repeat: escalate). Verify any cited ADR §/rule against the actual ADR text before
  fixing — the reviewer has fabricated citations before (#1201); rebut fabricated
  findings in a PR comment, fix only real ones. Otherwise dispatch a manual fixer.
  Batch all findings into ONE fixer pass and one push (cap-inflation guard: every push
  re-triggers §6a; the review cap is 5).
- **3d. CI complete + no review yet** and no review workflow running → dispatch a manual
  reviewer (reviewer skill; LGTM-or-Findings contract; posts via `gh pr review --comment`).
- **3e. Otherwise** → wait.

Informational checks (never block): `claude-review` check itself, CodeQL/Analyze,
Cloudflare Pages preview deploy. Note: a PR editing `claude-code-review.yml` (none
planned) needs a manual reviewer — the workflow check self-locks.

### Escalation

3 failed fix-cycles on one PR, an identical non-cap finding repeating, or a
CLOSED-not-merged PR → append `**ACTION:** <what + why>` to the log, `CronDelete` self,
stop. The maintainer re-engages from the log.

## Implementer agent prompt (instantiate per phase)

Dispatch via `Agent` with `subagent_type: "general-purpose"`, `isolation: "worktree"`,
`run_in_background: true`, description `Wave <W> · PR <N> <slug>`.

```
You are an implementation agent. PR <N> of Wave <W> in the perf edge-caching rollout:
<one-paragraph goal from the plan section>.

## Background
Plan: docs/superpowers/plans/2026-07-03-perf-edge-caching-rollout.md — read your PR's
section in full, plus "Global constraints". If not on origin/main, read via:
  git fetch origin && git show origin/docs/perf-edge-orchestration:docs/superpowers/plans/2026-07-03-perf-edge-caching-rollout.md
Measured baseline: docs/superpowers/plans/2026-07-03-query-timings-perf-analysis.md (same branch).

## MANDATORY READING — binding ADRs for the paths this PR touches
<run scripts/adr-context.sh <every path this PR touches> at dispatch time and inline the
output here verbatim; if empty: "No path-bound ADRs apply to this PR. Proceed.">

## Your scope
<the plan section's file list + exact changes, copied in>
DO NOT touch files outside this list. No new dependencies. No schema (openapi/asyncapi) edits.

## Comment style
Comments document non-obvious WHY, in one line. Default to no comment. Multi-paragraph
comment blocks (consecutive // or #, multi-line /* */ or """) are forbidden in new code —
the §6a reviewer flags them on every cycle. One line max, non-obvious why only.

## Domain skill
Before you begin, invoke the matching project skill: /frontend (frontend/**),
/jvm-backend (grid/** game/** identity/** billing/** survey/**), /schemas (never needed
in this rollout — no schema edits).

## How to ship
1. Branch off origin/main as <branch from phase map>.
2. TDD where the plan section says so: failing test first, prove it fails, implement, prove green.
3. Validate locally (plan "Global constraints" + your section's commands).
4. Commit with git commit -s, Conventional Commit, single scope, no PascalCase first
   word, body lines ≤100 chars.
5. Push and open the PR (gh pr create, base main). Title = commit subject. Body: Why /
   What / Test plan, cite ADR-0089 + the plan file, name the wave + PR number.
   <Phase 8 only: cite the ADR-0001 §4 2026-05-25 soft-target override in the body from
   the first push, per the procedure's standing-authorization section.>
   <If the PR touches infra/**, terraform/**, or a */api/deploy/** chart: update
   docs/infra/topology.yaml if a cloud resource/chart is added and run `make diagrams`;
   commit README.md if regenerated — readme-diagrams-drift gates it.>

## CI auto-fix loop
After pushing, poll gh pr checks every ~30s until all blocking checks terminate
(build/ci, commitlint, branch-name, dco, secret-scan, dependency-review, openapi-lint,
openapi-typescript-drift, helm-lint, api-chart-lint, readme-diagrams-drift,
registry-coherence — whichever apply). Fix failures (dco → git commit -s --amend
--no-edit + force-with-lease; commitlint → amend single scope; build → reproduce
locally, fix, push). Budget 3 passes, then stop and report. Do NOT act on
claude-review findings — the orchestrator owns that loop. Do NOT push more than once
per fix pass (batch fixes; every push burns a §6a review slot).

## Report back (≤250 words)
Branch + PR URL, file inventory + LOC (main vs tests), validation outputs, decisions
beyond the brief, blockers.
```

## Manual reviewer prompt

```
You are a §6a reviewer agent (implementer ≠ reviewer). Invoke the project `reviewer`
skill and follow it exactly. Review PR #<N> of the perf edge-caching rollout against
its plan section (docs/superpowers/plans/2026-07-03-perf-edge-caching-rollout.md,
read from origin/docs/perf-edge-orchestration if not on main) and the binding ADRs
(run scripts/adr-context.sh on the changed paths). First line of the review must be
"LGTM, no findings." or "Findings — ...". Post via gh pr review <N> --comment. Findings
cite rule + file:line + proposed fix. In-scope: this PR's diff only.
```

## Manual fixer prompt

```
You are a fixer agent for PR #<N> of the perf edge-caching rollout. Open findings:
<paste latest review findings>. Address each in the PR branch (worktree), batch ALL
fixes into one push. Verify any cited ADR rule against the actual ADR text first;
if a finding cites a non-existent rule, do not "fix" it — reply on the PR explaining
the discrepancy. After pushing, comment on the PR mapping finding → commit SHA.
Constraints: same as implementer prompt (comment style, commit conventions, DCO).
```

## Logging format

Append to the log's Event log section, one line per event:

```
- <UTC timestamp> · Phase <N> · <event: dispatched|opened|review-wait|fixer-dispatched|merged|escalated> · <PR # / agent desc> · <one-line detail>
```
