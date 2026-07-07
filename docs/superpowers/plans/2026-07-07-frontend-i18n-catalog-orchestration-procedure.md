# Frontend i18n Copy Catalog — Orchestration Procedure (cron-driven)

Cron-fired tick procedure for the frontend i18n copy-catalog wave rollout
(waves 2–6). The foundation (module + `t()` accessor + `ui/home` pilot)
already merged to `main` in PR #1449; this procedure rolls out the
remaining feature areas one PR at a time.

**Cron schedule:** `*/2 * * * *` (every 2 minutes; auto-expires after 7 days; recreate if the rollout exceeds 7 days).

**CWD:** run from repo root (`cd "$(git rev-parse --show-toplevel)"`).

**State source of truth:** `docs/superpowers/plans/2026-07-07-frontend-i18n-catalog-orchestration-log.md`.

**Pattern exemplar:** the merged PR #1449 (`frontend/src/ui/i18n/` + `ui/home` conversion) is the canonical template every phase copies. Implementers read the merged `frontend/src/ui/i18n/messages.fr.ts` and a converted home file (e.g. `frontend/src/ui/home/MiniGame.tsx`) before starting.

## Standing maintainer authorization (recorded 2026-07-07)

Verbatim in-session grants (citeable by the §6a reviewer):

- **Autonomy:** "usual cron is allowed" — the maintainer authorized the standard cron-driven autonomous orchestration mode for this rollout.
- **Merge authority:** the maintainer selected "Authorize me to merge" for the foundation PR and endorsed the usual cron (which merges on LGTM + green CI). The orchestrator merges a phase PR when all blocking checks are green AND the latest §6a review's first line is `LGTM` (case-insensitive). No `@maintainer` impersonation in comments — post as the orchestrator, cite this section.
- **400-line target:** no explicit proactive-override grant was given for this rollout. Each implementer still asks "should this be split?" first. If a phase genuinely cannot land under the target as one coherent workstream, prefer splitting the phase into two PRs (see Phase map notes). Escalate to the maintainer (log ACTION) rather than proactively bypassing the cap without a grant.

## Invariant conventions (every phase)

Copy verbatim into every implementer prompt:

- **Accessor:** `import { t } from '@/ui/i18n';`. Signature `t(key, params?)`. Never hand-edit generated types.
- **Catalog:** append keys to `frontend/src/ui/i18n/messages.fr.ts` (single `fr` object, flat dotted keys, `as const`, pure `string → string`). Group new keys near related ones; no section-divider comments (CLAUDE.md).
- **Interpolation:** i18next `{{name}}` placeholders; `t('key', { name })`.
- **Plurals:** i18next `_one` / `_other` suffix keys resolved by `count`; `t('key', { count })`. French: 0 and 1 → `_one`.
- **a11y key segments:** `.aria` = the value of an `aria-*` attribute; `.sr` = visually-hidden rendered text (`srOnly` / `role="status"` / `aria-live` span children). Visible copy carries neither.
- **Composed / live-region announcements:** prefer **one parameterized key** carrying all params (e.g. `'x.sr.progress': '{{label}} — {{pct}} %'`) over concatenating leading-space fragments in JSX. (The home pilot used fragments; do NOT copy that shape for new work.)
- **Apostrophes:** double-quote any catalog value containing a straight `'` (e.g. `"t'attend"`); a curly `’` may stay single-quoted.
- **Behavior-preserving:** each `t('…')` must return the identical French string that was inline. No wording, spacing, or punctuation drift. The dev-mode guard in `t()` throws on an unresolved `{{…}}`, so component tests catch a forgotten param.
- **Boundaries (`eslint.config.js`):** `ui/i18n` is layer `ui`; `ui/**` consumers import it freely. `design-system/**` has `allow: []` — it **cannot** import `ui/i18n` (see Phase 1). `application/**` imports only `domain` (see Phase 6).
- **Comments:** none unless a one-line non-obvious WHY. No multi-line blocks, no PR/issue refs.
- **Verify before commit:** `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Note: the repo's full `pnpm test`/`pnpm lint` suites have PRE-EXISTING failures unrelated to i18n (a shared `AuthProvider` test-setup issue; `lighthouserc.cjs` lint). CI's `build` job is the source of truth and is green on `main`. Confirm your change adds **no new** failures (compare against `origin/main`), typecheck/build stay green, and `grep` finds no bare French literal left in your scope.

## Phase map

Dependency-ordered. `design-system` becomes copy-agnostic before its `ui` consumers render its copy. Each phase branches off `origin/main` (foundation already merged); phases are strictly sequential — dispatch phase N+1 only after phase N's PR is MERGED.

| Phase | Branch | Base | PR title prefix | Scope |
|---|---|---|---|---|
| P1 design-system | `refactor/i18n-design-system` | `main` | `refactor(frontend): design-system copy-agnostic props` | Make the ~10 `frontend/src/design-system/**` components with French literals copy-agnostic: lift visible text **and** a11y strings (aria-labels) to **required props**; the `design-system` module keeps NO copy (it cannot import `ui/i18n`). Update every `ui/**` consumer to pass `t('…')` for the lifted props, adding the keys to the catalog. If the consumer ripple pushes past the target, split by component into two PRs (P1a/P1b) rather than bypassing the cap. |
| P2 play | `refactor/i18n-play` | `main` | `refactor(frontend): i18n ui/play` | Convert every French literal in `frontend/src/ui/play/**`. |
| P3 auth+lobby | `refactor/i18n-components-auth-lobby` | `main` | `refactor(frontend): i18n auth + lobby components` | Convert `frontend/src/ui/components/auth/**` and `frontend/src/ui/components/lobby/**`. |
| P4 shell+brand | `refactor/i18n-components-shell` | `main` | `refactor(frontend): i18n layout/brand/primitives components` | Convert the remaining `frontend/src/ui/components/**` (layout, brand, primitives, decorations, and any other subdirs). |
| P5 v2 | `refactor/i18n-v2` | `main` | `refactor(frontend): i18n ui/v2 multiplayer` | Convert `frontend/src/ui/v2/**` (~32 files). Likely exceeds the target — split by subdir into P5a/P5b if so (e.g. `v2/multiplayer/**` vs the rest). |
| P6 routes+seo+app | `refactor/i18n-routes-seo-app` | `main` | `refactor(frontend): i18n routes, seo, application` | Convert `frontend/src/ui/routes/**` and `frontend/src/ui/seo/**`. For `frontend/src/application/**` user-facing strings (e.g. `application/errors/messageForApiError.ts`): the `application` layer cannot import `ui/i18n`, so expose **codes/keys** from application and map them to copy via `t()` at the `ui` edge. |

## Tick procedure

1. `cd "$(git rev-parse --show-toplevel)" && git fetch origin --quiet`.
2. Read this procedure and the log file. Determine the active phase = the first phase in the map whose PR is not yet MERGED.
3. Assess the active phase:
   - **No PR yet, and all earlier phases MERGED** → dispatch the implementer for this phase (template below). Log `DISPATCHED`.
   - **PR OPEN** → apply the open-PR decision tree.
   - **PR MERGED** → advance to the next phase (and if it has no PR, dispatch it).
   - **PR CLOSED-not-merged** → escalate (log ACTION, `CronDelete` self, exit).
4. Take **at most one action per tick**, then stop. One-line decision per phase examined.

### Open-PR decision tree (apply top-down, act on first match)

- **Ready to merge.** All blocking checks `SUCCESS` (`build`, `commitlint`, `branch-name`, `dco`, `gitleaks`, `dependency-review`, `regen-and-diff`, `spectral`) AND `mergeable` AND `mergeStateStatus != BLOCKED` AND the latest §6a review's first line is `LGTM` (case-insensitive). → `gh pr merge <pr#> --squash` (no `--delete-branch`). Log `MERGED`. **If the permission classifier denies `gh pr merge`** (self-escalation guard — the 2026-07-05 lobby-owner-visibility rollout hit this on its first ready-to-merge phase, PR #1407): do not retry the merge and do not self-edit to grant `Bash(gh pr merge:*)`. Log `**ACTION:** merge blocked by permission classifier on PR #<n> — maintainer must run \`gh pr merge <n> --squash\` or grant \`Bash(gh pr merge:*)\``, `CronDelete` self, and exit. Resume by re-running `/orchestrate` or restarting the tick loop once the maintainer merges or grants the permission.
- **Auto-review alive.** `claude-review` is `IN_PROGRESS`/`QUEUED`, or a Claude Code Review run touched the branch in the last 15 min. → wait.
- **Findings, no fixer activity.** Latest review starts with `Findings —`, no `claude-review` run active, no commit since the review. → apply the **identical-finding loop-terminator** (dispatch skill §3c): if this cycle's first finding is structurally identical to the prior cycle's AND the diff changed between them, the loop is stuck → escalate (log ACTION + `CronDelete`). Otherwise dispatch a manual fixer (budget 3 cycles/phase; escalate after). Reviewer ≠ implementer.
- **CI done, no review yet.** All blocking checks concluded, reviews empty, no `claude-review` running. → dispatch a manual reviewer (template below).
- **CI running.** Otherwise → wait.

**Informational checks (NEVER block merge):** `claude-review` (posts findings as comments), `CodeQL` / `Analyze`, `deploy`, Lighthouse.

## Implementer agent prompt template

Dispatch with `Agent({ subagent_type: "general-purpose", isolation: "worktree", run_in_background: true, description: "i18n <phase> · <branch>", prompt: <below> })`. Fill `[PHASE]`, `[BRANCH]`, `[SCOPE PATHS]`, `[PR TITLE PREFIX]` from the phase map. Inline the output of `scripts/adr-context.sh [SCOPE PATHS]` under MANDATORY READING before dispatching.

```
You are an implementation agent for the frontend i18n copy-catalog rollout, phase [PHASE].
The foundation (t() accessor + catalog) is merged on main; you convert one feature area.

## Before you begin
Invoke the `/frontend` skill for repo conventions. Read the merged pattern first:
`frontend/src/ui/i18n/messages.fr.ts` (catalog) and `frontend/src/ui/home/MiniGame.tsx`
(a converted consumer). Then run, from repo root, and READ the output in full:
  scripts/adr-context.sh [SCOPE PATHS]

## MANDATORY READING — binding ADRs for the paths this PR touches
[INLINE scripts/adr-context.sh OUTPUT HERE]

## Scope
Convert every French user-facing literal — visible text AND accessibility strings
(aria-labels, live-region/sr-only announcements, placeholders, titles) — in:
  [SCOPE PATHS]
to resolve through `t()` from `@/ui/i18n`, adding keys to
`frontend/src/ui/i18n/messages.fr.ts`. Enumerate remaining literals with:
  grep -rnE ">[^<>{}]*[A-Za-zÀ-ÿ]{3}[^<>{}]*<|(aria-label|title|placeholder)=\"" [SCOPE PATHS]
Leave internal enum/const values that are not user-facing.

## Invariant conventions
[PASTE the "Invariant conventions" section from the procedure file verbatim]

## DO NOT
- Touch files outside [SCOPE PATHS] except where a lifted design-system prop requires
  a consumer update (phase P1 only).
- Add a runtime dependency, change a schema, or edit generated types.
- Alter uncontrolled-input wiring (ADR-0002 §4) — swap only string props.
- Change behavior: every t() must return the identical inline French string.

## How to ship
1. Branch off origin/main as [BRANCH].
2. Implement.
3. Validate: `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
   The full test/lint suites have pre-existing unrelated failures — confirm you add
   NONE new vs origin/main; typecheck + build must be green.
4. Commit with `git commit -s`, Conventional Commit, message body ending:
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
5. Push `git push -u origin [BRANCH]`, open a PR (base main) titled "[PR TITLE PREFIX]".
   PR body: Why / What / the a11y strings covered / that it is behavior-preserving /
   "Wave of the i18n rollout; foundation #1449". Ask "should this be split?" if near
   the 400-line target; prefer splitting over bypassing.

## Comment style
Default to no comment. If any, one line on a non-obvious WHY. No multi-line blocks, no
PR/issue refs.

## CI auto-fix loop
After pushing, poll checks every ~30s. Blocking: build, commitlint, branch-name, dco,
gitleaks, dependency-review, regen-and-diff, spectral. If a blocking check fails,
diagnose+fix (dco→amend -s+force-push; commitlint→single conventional scope;
build(frontend)→typecheck/lint/test/build locally). Budget 3 passes, then report the
blocker. Do not block on claude-review/CodeQL/deploy.

## Report back (<250 words)
Branch + PR URL, file inventory + LOC (src vs added keys), the four validation results
(and confirmation of no-new-failures vs main), any decisions beyond the brief, blockers.
```

## Manual reviewer dispatch prompt

```
Agent({ subagent_type: "general-purpose", isolation: "worktree", run_in_background: true,
  description: "Manual reviewer PR #<N> (auto-reviewer hung)",
  prompt: "Invoke the `reviewer` skill. Review PR #<N> of the frontend i18n rollout
  (base main). Verify: every extracted string is byte-identical to the original inline
  literal (no wording/spacing/punctuation drift); `.aria` vs `.sr` segments correct
  (.aria = aria-* attribute value, .sr = visually-hidden rendered text); interpolation
  params match placeholder names; plurals via count; behavior-preserving; boundaries
  respected (design-system holds no imported copy; application maps codes at the ui edge);
  commit hygiene (conventional, DCO, co-author trailer). Post `LGTM, no findings.` as the
  first line, or `Findings — ` followed by file:line findings, via `gh pr review`. If the
  same-actor token rejects --approve, use --comment; keep LGTM as the first line." })
```

## Manual fixer dispatch prompt

```
Agent({ subagent_type: "general-purpose", isolation: "worktree", run_in_background: true,
  description: "Manual fixer PR #<N> (auto-fixer hung)",
  prompt: "Fix the open §6a review findings on PR #<N> of the frontend i18n rollout.
  Read the review via gh. Address each finding minimally, preserving behavior and the
  i18n conventions (invariant section). Re-run `cd frontend && pnpm typecheck && pnpm
  test <touched files>` and confirm no new failures vs origin/main. Push, then comment on
  the PR mapping each finding → commit SHA. Budget 3 passes. Commit with -s + the
  Co-Authored-By trailer. Do NOT act as the reviewer." })
```

## Logging format

Append one line per event to the log file's Event log, ISO-8601 UTC prefix:

```
- <ts> · <PHASE> · <EVENT> · <detail> (PR #<n>, commits <sha>)
```

`EVENT` ∈ `DISPATCHED | OPENED | REVIEW_DISPATCHED | FIXER_DISPATCHED | MERGED | WAIT | ACTION`. Prefix any human-needed item with `**ACTION:**`.

## End condition

When P6 (or its last split) merges:
- Append `**ACTION:** i18n rollout complete — all frontend wording centralized. Remind the user; suggest the optional ESLint regression-guard follow-up (out of scope for the waves).`
- `CronDelete <cron-id>`; exit.
