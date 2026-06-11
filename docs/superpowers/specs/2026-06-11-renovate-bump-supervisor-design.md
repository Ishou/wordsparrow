# Renovate bump supervisor — design (DRAFT)

**Date:** 2026-06-11
**Status:** DRAFT — brainstorm converged on the shape; open questions remain (see end). Not yet approved.
**Branch:** `docs/renovate-bump-supervisor-spec`

> This is a partial spec captured at the end of a long brainstorm. The
> architecture and agent breakdown are settled; the bracketed **OPEN
> QUESTIONS** at the end are the decisions to finish before writing the
> implementation plan.

## Problem

Renovate opens dependency-bump PRs. Two things break for non-trivial bumps:

1. **§6a fights Renovate's branch.** When a bump needs accompanying changes
   (a major like helm v3→v4 needs doc/config/code migration, not just a
   version string), the §6a auto-fixer *pushes* those changes onto Renovate's
   branch. Renovate then shows **"Edited/Blocked — Renovate will not
   automatically rebase … someone may have edited the PR,"** and its own
   rebase button warns **"custom changes will be lost."** So you deadlock:
   don't rebase → PR stays CONFLICTING; rebase → lose the §6a fixes.
   (Observed on PR #814, helm v3→v4.)

2. **Major bumps need real migration work + a preview, not auto-merge.** A
   version bump and its migration are *one logical change* and belong in one
   PR — but that PR must not be Renovate-owned, and it deserves human
   judgment before main.

**Root truth:** Renovate's branch wants to be Renovate-only. So nothing should
ever *edit* it. Enrichment + migration must happen on a **claude-owned** branch.

## Framing: this repo is a lab

This is deliberately heavier than this solo repo strictly needs. That's the
point: the small, single-maintainer repo makes it *easy* to build, and the
result is a **reusable, fully-CI-native pipeline** other (larger) repos can
adopt by dropping in workflow files. Optimize for reusability + isolation,
not for minimal machinery here.

## Rollout strategy: incremental, one dep at a time

The pipeline is **adopted incrementally, dependency by dependency** — not
switched on for the whole tree at once. This is the overarching strategy, of
which the "signoz-only" cost guardrail (#13) is just the first step:

1. **Start with `signoz` ONLY.** Scope the pipeline (a `packageRules`/path
   allowlist) to exactly one dep. Run the real bumps, watch how every stage
   behaves, refine.
2. **Expand one dep at a time.** Add the next dep to the allowlist only once the
   previous one behaves well. Each addition is a deliberate, observed step —
   we're iterating on the *pipeline's behaviour*, using real deps as the test
   bed.
3. **Promote to the whole tree** only once we're satisfied the pipeline works
   across the variety of deps we've tried. The allowlist is removed (or
   inverted to a denylist) at that point.

This makes the allowlist a **confidence ratchet**, not just a cost cap: breadth
grows exactly as fast as trust does. It also means early deps double as the
live test cases from #10 (signoz first, then helm v4 / #814, …).

## Converged decisions

1. **A new pipeline of agents — not the existing §6a reviewer.** §6a stays for
   normal code review on the *claude* PR (stage D output).
2. **Fully CI-native.** Every agent is a `claude-code-action` job in GitHub
   Actions. No local orchestrator / `Workflow` tool — that runs only in a local
   Claude session, can't run in CI, and isn't portable. The plan-refinement
   loop reuses the **§6a self-re-triggering cycle pattern** (`claude-code-review.yml`)
   which already proves loop-in-CI works in this repo. Bonus: separate
   `claude-code-action` jobs give **hard context isolation** — each agent gets
   a fresh scoped context and can't inherit another agent's bias or
   reasoning chain.
3. **Grounded, never from memory.** Migration steps must come from fetched
   official sources (release notes, breaking-changes, migration guides,
   `llms.txt`-style AI-migration logs), each citing a URL. Fetch and reason are
   *separate* agents so reasoning can't drift ungrounded.
4. **One dependency at a time.** Do not generalize across all ecosystems at
   once; prove the loop on one (likely major version bumps, infra/JVM first,
   reusing the helm-enrich plumbing), then expand.
5. **Renovate's branch is only ever READ.** A/B/C read it + comment; nothing
   commits to it. The fork + close happens at D-time, once we commit to
   migrating — so the clobber can't happen.
6. **Gates are time/token savers + one real safety net.** A's source gate and
   B's verdict are advisory efficiency gates (false positives/negatives are
   fine); the **human merge** of the claude PR is the actual safety guarantee.

## Architecture (fully CI-native)

```
Renovate opens a MAJOR bump PR (renovate/*)
        │
   ┌────┴─────────────────────────────────────────────────────┐
   │ Agent A — Doc gatherer (claude-code-action)               │
   │   reads bump + Renovate changelog links + source registry │
   │   + WebFetch/WebSearch. NEVER reads the codebase.         │
   │   → standardized, grounded migration-context doc          │
   │   → posts comment + uploads artifact; self-rates source   │
   │   GATE A: sourceConfidence low/none → label + comment     │
   │           "can't ground this major", STOP (human).        │
   └────┬─────────────────────────────────────────────────────┘
        │ (groundable)
   ┌────┴─────────────────────────────────────────────────────┐
   │ Agent B — Planner (claude-code-action)                    │
   │   reads A's doc (as data) + the CODEBASE                  │
   │   → { impacted, plan[file-refs], planConfidence }         │
   │   impacted=false → "no surface we use changed" →          │
   │       let Renovate's PR merge normally. STOP.             │
   │   impacted=true → plan → C                                │
   └────┬─────────────────────────────────────────────────────┘
        │
   ┌────┴── Agent C ⇄ B — plan refinement loop ────────────────┐
   │   C (fresh context) critiques the plan vs grounded docs;  │
   │   B revises; capped + identical-finding terminator;       │
   │   can't converge → escalate to human.                     │
   │   → finalized plan POSTED to the PR (visible, NON-block)  │
   └────┬─────────────────────────────────────────────────────┘
        │ (plan converged)
   ┌────┴─────────────────────────────────────────────────────┐
   │ Agent D — Implementer (claude-code-action)                │
   │   FORK claude/<dep>-vN from the bump; CLOSE Renovate PR.  │
   │   implement the plan on the claude branch; open claude PR │
   └────┬─────────────────────────────────────────────────────┘
        │
   §6a reviewer/fixer cycle on the claude PR (code — unchanged)
        │
   GATE (final): human reviews + merges.
```

**Human touchpoints: exactly two** — Gate A escalation (only when grounding is
missing/weak) and the final merge. Everything between is automated.

## Agent contracts

### Agent A — Doc gatherer
- **Runs on:** a Renovate `major` bump PR.
- **Reads:** dep + old→new version; Renovate's changelog/release links from the
  PR body; a generalized source registry (extends `infra/tools-upgrade-sources.yaml`);
  WebFetch/WebSearch. **Never the codebase** (isolation → can't hallucinate
  project specifics).
- **Emits** the A→B contract (standardized migration-context doc), roughly:
  ```
  { dep, from, to,
    sourceConfidence: high|medium|low|none,
    sources: [{ url, type, fetchedOk }],
    breakingChanges|deprecations|removals: [{ summary, detail, sourceUrl }],
    migrationSteps: [{ instruction, sourceUrl }] }   // each cites a source
  ```
- **Output goes to:** a PR comment (human-readable) + an uploaded artifact (for B).
- **Gate A:** `sourceConfidence ∈ {low, none}` (no docs, or thin/ambiguous) →
  label `bump-needs-human` + comment → STOP.

### Agent B — Planner
- **Runs only if** A passed.
- **Reads:** A's doc (as *data*) + the codebase.
- **Emits:** `{ impacted: bool, plan: [steps with file refs], planConfidence }`.
  - `impacted=false` → trivial-for-us → signal "let Renovate's PR merge", STOP.
    (This is the only reliable "trivial" verdict — only B compares to our code.)
  - `impacted=true` → plan → C.

### Agent C — Plan reviewer (fresh context) ⇄ B
- **Reads:** A's doc + the plan + the codebase, independently.
- **Job:** corrective for B's self-confidence — critique the plan for
  completeness/correctness against the grounded breaking-changes.
- **Loop:** C findings → B revises → re-review. Capped + identical-finding
  terminator (the §6a scars). Can't converge → escalate to human.
- **Output:** finalized plan, posted to the PR (visible, non-blocking).

### Agent D — Implementer
- **First:** fork `claude/<dep>-vN` from the bump; **close the Renovate PR**.
- **Then:** implement the plan on the claude branch; open the claude PR → hands
  to the existing §6a code cycle → human merges.

## Reuse of existing pieces

- **Enrichment pipeline** (`helm-bump-enrich.yml`, ADR-0067): A generalizes it
  — same "fetch release notes, cite sources" idea, broadened beyond helm.
- **§6a cycle** (`claude-code-review.yml`): the B↔C loop is modeled on it; the
  code review of the claude PR *is* it, unchanged.
- **Source registry** (`infra/tools-upgrade-sources.yaml`): A's registry of
  per-dep doc locations extends this.

## Lessons to bake in (from this session)

- §6a cap-inflation: every push re-triggers a cycle; don't burn the cap.
- Cap-lock → a fresh-context reviewer breaks it.
- A PR that edits a workflow file fails `claude-code-action`'s App-token check
  (so the supervisor's own workflow edits need manual merge).
- `gh` GraphQL returns the §6a review author as `github-actions` (no `[bot]`).
- Renovate authors PRs as the PAT owner; closing a Renovate PR makes Renovate
  *not* re-propose that update (treats it as ignored).

---

## Revised arrangement (2026-06-12): the GH issue is the pipeline spine

A fresh mental model that reorganizes the pipeline around a durable issue
rather than a transient PR. **Captured to lock it in; supersedes the
PR-centric framing above where they conflict** (the architecture diagram +
agent contracts get reconciled to this in the self-review pass — task #23).

**Maintainer's model (raw):**
- A Renovate PR triggers the pipeline either **deterministically** (Step 0:
  major / 0.x-major) or via the **AI gate** (minor/patch smell test says
  breaking/ambiguous).
- **"Triggering the pipeline" = creating a dedicated GH issue.**
- That **issue is now the pipeline's starting point and home**: first
  enrichment (Agent A) lands on it, then the B↔C cycle runs *through the
  issue*, then an implementer **D** is dispatched and opens the PR that will
  (or not) **close the issue**.
- Feasibility confirmed: GH Actions fires on `issues` / `issue_comment`
  events, and `claude-code-action` runs on them (its canonical tag mode). So
  an issue-hosted pipeline is fully supported.

**Why this is better:** decouples the pipeline from transient PRs. Renovate PR
= *trigger*; claude PR = *output*; the **issue = persistent spine** holding the
whole history (enrichment, plan, reviews), surviving both PRs closing. Unifies
success + failure tracking: created at pipeline start, auto-closed when the
claude PR merges, left open as `bump-needs-human` on failure.

**Amends #6:** the issue is no longer created lazily-only-on-failure — it's
created when the pipeline *triggers* (non-trivial bumps) and auto-closes on
success. Trivial bumps (AI-gate green) still make **no** issue, so "no noise
for trivial" holds; majors are rare enough that a per-migration tracking issue
is a feature.

**Loop mechanics — SETTLED (2026-06-12):** B↔C runs as **#4's bounded single
workflow run** (one run, jobs `A → B1 → C1 → … → D` chained by `needs:`, state
via artifacts, each job a fresh `claude-code-action`). The issue is the
visibility/durability *medium* — each job posts its result there as a comment
(enrichment, per-round summaries, final plan, escalations) — but the issue is
**not** the control-flow *trigger*. ("Comment loop" was loose wording; the run
drives the loop, the issue merely *records* it.) This is deliberate: a literal
comment-re-trigger loop would reintroduce the cap-inflation /
self-trigger-ping-pong footguns #4 was built to avoid. Comments as a *log*
(good); comments as the *trigger mechanism* (footgun, rejected). With a bounded
run, "6 rounds" is literally "6 jobs" and nothing external can re-fire it.

**B's output is CATEGORIZED, not binary (2026-06-12).** B↔C doesn't just answer
"are we impacted?" — it produces findings in three categories, each with a
different *destination*:

| Category | What | Destination |
|---|---|---|
| **(a) Mandatory migration** | breaking changes touching code/config we actually use | **In D's PR.** The pipeline *attempts* the fix → ready-for-human-review claude PR. **"Blocks merge" = must be in D's PR to merge, NOT "halts the pipeline."** A solvable migration is never punted to the human — the pipeline tries hardest; the human only does it themselves on *pipeline failure* (Gate A / no convergence / §6a cap). |
| **(b) Doc/ADR coherence** | stale docs/ADRs/comments referencing the old version or old behavior | **Also in D's PR** — "registries cannot lag" (CLAUDE.md), a bump isn't *done* if docs point at the old version. **Bounded** to *this dep*, not open-ended doc-gardening. |
| **(c) Opportunistic refactor** | new-version features enable a high-reward improvement we're *not forced* to make | **NOT in the bump PR** — it's a second workstream (one-workstream-per-PR + 400-line cap). **Surfaced as a separate `bump-enhancement` GH issue** (created + labeled, **no automated workflow for now**); the human decides if/when/who. |

The "let Renovate's PR merge" early-exit fires **only when all in-scope
categories (a)+(b) are empty**. Doc drift but no code impact → D still opens a
(docs-only) PR.

**Issue label taxonomy (chosen 2026-06-12):**
- **`bump-supervisor`** — umbrella on *every* issue the pipeline creates
  (provenance + the #6 dedup key is label+dep).
- **`bump-needs-human`** — the spine/tracking issue when a bump *fails*
  (must-fix). Two issue *kinds* exist: the **spine issue** (one per non-trivial
  bump, its operational home; gets `bump-needs-human` only on failure) and the
  **enhancement issue** below.
- **`bump-enhancement`** — a category-(c) optional improvement (no urgency,
  separate PR later). The must-do vs optional split = `bump-needs-human` vs
  `bump-enhancement`.

---

## OPEN QUESTIONS (for tomorrow)

1. ✅ **RESOLVED — Scope / trigger.**
   - **Pre-filter (whether to run Agent A):** `updateType == major` **OR**
     (`currentMajor == 0` AND `updateType == minor`). Under semver, `0.x` is
     unstable and a minor bump there is breaking-equivalent, so 0.x-minor is
     treated as major. Renovate exposes update type + version components (apply
     via a `packageRules` label so the workflow can filter on it).
   - **Real gate:** version-type is only a cheap proxy. **A's "are there
     breaking changes?" finding is the true gate** — a "major" whose docs show
     no breaking changes early-exits and Renovate's PR merges normally. This
     gives breaking-change-based correctness without paying to run A on every
     patch.
   - **Accepted blind spot:** a patch/minor that *secretly* ships breaking
     changes (a dep violating semver) won't trip the pre-filter, so A never
     runs on it. Accepted as-is: it's rare, and the breakage is caught
     downstream anyway by the code test suite + manual tests + the human merge
     gate (defense in depth). Revisit with a changelog-keyword escalation only
     if it bites in practice.
2. ✅ **RESOLVED — A's doc-finding + A *is* the evolved enrichment pipeline.**
   - **Agent A = generalize + restructure + gate the existing `helm-bump-enrich`
     work** (the CI → `claude-code-action` → WebFetch official docs → synthesize
     → post-to-PR mechanic is already built and proven on `main`). Four deltas
     to build:
     1. **Scope:** drop the helm-only trigger (`infra/**/Chart.yaml`); generalize
        to all ecosystems.
     2. **Output:** emit the structured A→B schema (see #3) as *data*, not just
        prose (prose stays as a human-readable rendering).
     3. **Sourcing:** lead with **Renovate's own changelog/release links** (in
        the PR, covers the long tail for free) → **web search** for a dedicated
        migration/upgrade guide + an `llms.txt`-style AI-migration-doc probe →
        the `tools-upgrade-sources.yaml` registry only as a **reactive override,
        starting EMPTY** (we learned hand-authored URLs rot/404 — don't
        pre-populate).
     4. **Confidence gate:** A self-rates `sourceConfidence`; no/thin docs →
        **Gate A** escalation.
   - **Carryover:** the helm-specific **values-diff** (upstream defaults
     changed, overridden-keys flagged) stays as a helm-only *extra* A attaches
     for helm bumps — it doesn't generalize but isn't wasted.
3. ✅ **RESOLVED — the standardized A→B schema.**
   - **JSON artifact = the contract.** B consumes the JSON as *data*; the
     human-readable migration notes A posts to the PR are a side rendering of
     the same content. (Today's enrichment only produces prose — adding the
     JSON is delta #2 from #2.)
   - **Strictly project-agnostic.** A never reads our code, so the schema
     describes *only the upstream change*, with **zero references to our
     files**. Any project mapping is B's job; A attempting it would be
     hallucination. This is what makes the isolation real.
   - **Every claim cites a `sourceUrl`.** A breaking-change / deprecation /
     removal / migration-step with no `sourceUrl` is **invalid output** — the
     no-hallucination posture made structural.
   - **`detail` = verbatim quote; `summary` = A's one-line handle.** Demoting
     A from *interpret* to *locate + quote* shrinks A's interpretive surface:
     B is anchored to real upstream text next to every claim, not a paraphrase
     it could inherit errors from. URLs are retained so B can **re-fetch the
     full guide** when an excerpt isn't enough; we **do not** dump whole docs
     inline (huge migration guides are noise — the URL covers "go deeper").
   - **Two grounding axes — the schema only fixes one.**
     - *Upstream (A→B):* fixed by verbatim `detail` + `sourceUrl` above.
     - *Downstream (B→our repo):* the schema does **not** touch this — it's
       where B is most likely to hallucinate (claiming *our* code uses the
       changed API when it doesn't). Fixed by B **reading the actual files**
       before asserting, and by **Agent C verifying B's diff** against both
       the excerpts and the real code. Net: the schema makes A honest; C makes
       B honest.

   Shape:
   ```jsonc
   {
     "dep": "...", "from": "...", "to": "...",
     "sourceConfidence": "high|medium|low|none",
     "sources": [{ "url": "...", "type": "changelog|migration-guide|llms-txt|release", "fetchedOk": true }],
     "breakingChanges": [{ "summary": "...", "detail": "<verbatim quote>", "sourceUrl": "..." }],
     "deprecations":    [{ "summary": "...", "detail": "<verbatim quote>", "sourceUrl": "..." }],
     "removals":        [{ "summary": "...", "detail": "<verbatim quote>", "sourceUrl": "..." }],
     "migrationSteps":  [{ "instruction": "<verbatim quote>", "sourceUrl": "..." }]
   }
   ```
   (Exact field names finalize in the plan; the *shape* above is the decision.)
4. ✅ **RESOLVED — B↔C plan-loop mechanics.**
   **Framing:** the plan is the **backbone** of the whole pipeline — the loop's
   job is a *neat, complete, grounded plan*, not minimal rounds. Token/time
   savings are a **bonus, not a priority**; the priority is a **working
   major-bump pipeline**. (This lens governs the remaining questions too.)
   - **Inspire from §6a, don't inherit it.** B↔C reviews a **plan document**,
     not a code diff — so none of §6a's `synchronize` comment-re-trigger
     machinery (and its cap-inflation / self-trigger footguns) is reused. We
     borrow only the *shape*: cycle-until-approved + identical-finding stop.
   - **Self-contained bounded loop, one workflow run.** B and C run as
     alternating **jobs within a single run** (fresh context each → isolation
     preserved), passing `plan.json` / `findings.json` between them via
     artifacts. No per-push re-trigger exists → **cap-inflation is structurally
     impossible**. That's the payoff of not inheriting §6a.
   - **Cap = 6 rounds** (B→C up to ×6), unrolled as conditional jobs. It's a
     *max* — lived experience with the §6a reviewer/fixer cycle shows 3 is too
     short and it usually converges earlier than 6. Enough room to drive the
     backbone plan to complete-and-grounded without the loop spinning forever.
   - **C's output:** `{ approved: bool, findings: [...] }`. First
     `approved:true` short-circuits remaining rounds → dispatch D.
   - **C's mandate is NARROW — completeness + grounding vs A's schema only.**
     "Does the plan cover every breaking-change / migration step from A, and
     does each plan step reference a real file?" **Not** "is this good code?" —
     code correctness is §6a's job on D's diff. If C drifts into code-quality
     it just re-litigates §6a downstream and becomes ceremony.
   - **Identical-finding terminator:** if round N's findings == round N-1's, B
     is genuinely stuck → stop early + escalate (a safety net, not a
     token-saver).
   - **Escalation (cap hit or stuck):** open/update the durable
     `bump-needs-human` GH issue (see #6) with the unresolved findings → STOP.
     Never auto-proceed to D.
   - **On approval:** the run dispatches D (fork `claude/<dep>-vN`, close the
     Renovate PR, implement, open the claude PR → real §6a on the code).
5. ✅ **RESOLVED — ratings are ascending (consumer rates producer), never
   self-rated.** Self-rated confidence is an unreliable vibe; instead every
   output is judged by its **independent downstream consumer**:
   **B→rates→A, C→rates→B, §6a→rates→D.** No agent grades its own homework.
   - **B rates A** (sufficiency-to-plan). B is the right judge because B has to
     *plan from* A's context — thin enrichment is felt directly. This **is
     Gate A**, now consumer-judged: B's first act is to rate A's output; `low`
     or `none` → open/update the `bump-needs-human` issue (see #6) + STOP (B
     doesn't waste effort planning).
     Rubric (evidence-based, a classification of facts — not a feeling):
     - **`high`** — dedicated migration/upgrade guide for this exact transition
       (title/URL matches migration/upgrade/breaking), fetched 200, breaking
       changes spelled out.
     - **`medium`** — changelog/release notes *enumerate* changes but no
       dedicated guide; breaking changes inferable, not spelled out as steps.
     - **`low`** — only thin/ambiguous sources (release page with no detail,
       partial 404s, changes named but unexplained).
     - **`none`** — no usable source fetched.
   - **One cheap self-check survives on A** — a pure objective tripwire: *A
     fetched zero usable sources → stop before even running B.* That's a fact
     ("nothing to plan from"), not a confidence vibe. Everything substantive is
     consumer-judged.
   - **C rates B** (completeness + grounding vs A's schema) — already C's job
     in the plan loop (#4). This replaces the old self-rated `planConfidence`,
     which is **dropped**.
   - **§6a rates D** (code correctness) — the existing terminal link.
   - **No "D rates C."** C produces no artifact D consumes — C's sole purpose
     is to rate/gate B. The plan flows A → B → [C gates] → D, so the only
     coherent "was the plan implementable?" rating would be D rating *B's
     plan*, which C (a fresh-context rater) already did. Redundant → dropped.
   - **Rejected — a generalized review/fix loop at every seam** (B rates A → A
     fixes → re-rate, etc.). A is **doc-bound**: if B asks A to supply a
     migration step that no doc contains, A re-fetches forever against a wall.
     The zero-doc case is already handled by A's deterministic tripwire, and the
     only residual win (A under-extracted an *existing* doc) is too narrow to
     justify the loop. The *uniform* "consumer-rates-producer review/fix"
     principle is a nice pattern to generalize in a future session, but here it
     collapses to one doc-bound loop and isn't worth it.
6. ✅ **RESOLVED — D's fork/close + a GH issue as the durable escalation
   artifact.**
   - **Fork from Renovate's branch tip, not main.** Preserves the exact bump
     commit Renovate computed (version string + lockfile), so D only *adds*
     migration commits — D never re-does the version bump (no fat-fingering).
     Resulting branch = 1 renovate-authored commit + D's claude commits; fine
     for DCO (bot commits exempt) and commitlint (Renovate's message already
     passes). **Bidirectional breadcrumb:** claude PR body links the Renovate
     PR; D's closing comment on the Renovate PR links the claude PR.
   - **Failure-safe ordering:** open the claude PR **first**, confirm it's real,
     **then** close Renovate's. Never close-first — if D dies mid-way,
     Renovate's PR stays open and nothing is lost.
   - **Durability via a dedicated GH issue, not the dashboard.** Closing a
     Renovate PR makes Renovate treat that version as *ignored* (won't
     re-propose it; will still propose a *newer* version later). A dashboard
     checkbox carries no context and a PR comment dies with the PR. So a
     **GH issue is the single durable escalation artifact for *every*
     human-needed outcome** — Gate A (no docs), plan-loop non-convergence, D
     failure, *and* claude-PR-closed-unmerged. It's persistent (outlives any
     PR), actionable/assignable, and carries the *why*: which gate failed,
     links to the dead claude PR + original Renovate PR, dep + version. The
     `bump-needs-human` label moves onto the **issue**; this **supersedes the
     "label + PR comment" escalation wording in #4 and #5** (the label/why now
     land on the issue, which survives PR closure).
     - **Lazy:** created only when a human is genuinely needed. Happy path
       (bump merges) makes **no** issue — no noise for success.
     - **Deduped:** one issue per dep-major-transition; *find-or-update* (search
       open issues by `bump-supervisor` label + dep name before creating), not
       a fresh issue per retry.
     - **Auto-close:** closed when a later attempt for that dep actually merges,
       so stale failures don't accumulate.
     - **No `recreateWhen: always`** — it would fight us by reopening the PR we
       just closed. The dashboard is demoted to an incidental ledger.
7. ✅ **RESOLVED — Step 0 dispatcher + AI gate replace §6a on Renovate PRs.**
   - **Root-cause invariant: no automated job ever pushes to a `renovate/*`
     branch.** A/B/C read+comment, D forks. §6a's *fixer* obeys this too. This
     is the universal fix for the #814 clobber — stated once, covers every case.
   - **§6a is suppressed entirely on `renovate/*` branches** (one `if`
     excluding `startsWith(head_ref, 'renovate/')`). The real §6a still runs on
     D's `claude/<dep>-vN` PR and every other PR. #816 was right in instinct
     (don't let §6a clobber Renovate) but premature — it removed §6a with
     *nothing to replace it*. Now the pipeline replaces it, so suppression is
     safe.
   - **Step 0 — the deterministic dispatcher (no AI).** Runs on *every*
     `renovate/*` PR; reads Renovate's update metadata via the `packageRules`
     label from #1 (Step 0 is that label's consumer). It *routes*; the
     trivial-bump majority costs **zero tokens** (AI only ignites at Agent A).
     This is what "replaces §6a on Renovate PRs."
   - **The AI gate (A-lite) for non-major bumps.** Premise correction from #1:
     with `automerge:false` a human still *clicks* merge on minor/patch, but
     that's a **rubber-stamp, not a review** — so "the human gate catches it"
     was overclaimed. The else-branch therefore gets a *gating* (not advisory)
     cheap **breaking-change smell test**: read the *changelog only* (no
     codebase), one call. A **green verdict is a silent stamp** (a passing
     check, no comment) → broad coverage adds cost but **no noise**.
   - **Control flow:**
     ```
     if   [deterministic: major / 0.x-major(x position)]  → pipeline (A→B→C→D)
     elif [AI gate: breaking, or changelog-exists-but-ambiguous] → pipeline (loop-back)
     else [minor/patch + AI gate green]                   → stamp mergeable
     ```
   - **No-doc response scales with severity** (resolves the no-changelog trap):
     - **minor/patch + no doc → stamp mergeable.** Lowest risk; semver says no
       breaking, CI tests are the backstop. Escalating these would flood issues.
     - **major + no doc → "error" = Gate A escalation → `bump-needs-human`
       issue** (the actionable path from #5/#6), **not** a bare red-X dead-end.
       Highest risk + no guidance → a human must look.
   - **Scope:** the AI gate runs on **minor AND patch** (incl. 0.x's y
     position). Chosen for blind-spot closure over token cost (tokens are a
     bonus; green = silent so no noise). Simpler one-bucket rule beats a
     minor-only tiered split.
   - **Irreducible residual blind spot:** undocumented **AND** semver-violating
     **AND** untested. No cheap gate catches that, and escalating every
     undocumented patch is too costly a "fix." Accepted — far smaller than #1's
     original hole. See deferred per-dep semver-trust registry (Deferred ideas).
8. ✅ **RESOLVED — Agent A subsumes `helm-bump-enrich`.** The general supervisor
   absorbs the helm-specific pipeline (it becomes a special case of A), not run
   alongside. See #2.
9. ✅ **RESOLVED — error handling funnels to the `bump-needs-human` issue.**
   **Principle:** every failure funnels to the deduped issue (#6); the Renovate
   PR stays open until D succeeds, so any failure *before* D loses nothing.
   | Failure | Handling |
   |---|---|
   | **A fetch fails** | Bounded retry on *transient* (timeout/5xx) before concluding "no doc" — a flaky fetch must not trigger Gate A. Total no-doc → severity rule from #7 (major → issue; minor/patch → mergeable). |
   | **B can't plan (BLOCKED)** | → issue. **B `impacted=false` is NOT an error** — it's the trivial-for-us early-exit → stamp mergeable; must not be read as failure. |
   | **B↔C deadlock** | Already #4 — cap hit / identical-finding → issue. |
   | **D's CI fails** | *Not a new path.* The claude PR is a normal PR → the existing §6a fixer cycle repairs it. Escalates only if §6a *also* fails (next row). |
   | **§6a cap on claude PR** | → issue + leave the PR open for human takeover (a normal PR they can push to). **Never auto-merge a cap-locked PR.** |
   | **Abandoned claude PR** | Already #6 — the issue is the durable tracker (deduped, auto-closes on eventual merge). |
   Two cross-cutting additions (not just "→ issue"):
   - **Infra/job crash catch.** Distinct from "agent concluded it can't
     proceed": a runner OOM, a `claude-code-action` 5xx, or a GH outage crashes
     the *job*. Without handling, a crash *after* D closes the Renovate PR =
     silently-dropped bump (the exact "vanish" we guard against). Every pipeline
     workflow gets a top-level `if: failure()` step that opens/updates the issue
     ("infra failed at stage X"). Pre-D crash → Renovate PR intact; post-D crash
     → abandoned-claude-PR case.
   - **Idempotency on re-trigger.** Renovate rebases re-fire `pull_request`
     (synchronize) on the same bump. Guard against duplicate work — D checks for
     an existing `claude/<dep>-vN` PR before forking; issue dedup is #6.
     (Concurrency-*key* mechanics → #11; this is just the don't-double-act guard.)
   - **No auto-resume machinery** — a human picking up the issue takes over the
     claude PR manually (YAGNI; it's a normal PR).
10. ✅ **RESOLVED — testing + first real case.** Key framing: **separate "does
    the orchestration plumbing work" (testable) from "do the agents reason
    well" (live-only).**
    - **Deterministic logic → real unit tests (CI, no LLM).** Enabler: push all
      deterministic logic into **tested scripts** (Python, mirroring
      `scripts/helm-enrich/*.py` + tests); keep workflow YAML thin (YAML isn't
      testable). Covered: Step 0 routing (table-driven `(updateType,
      currentMajor)→route`); A→B schema validation (**property-based** per
      CLAUDE.md — the #3 "every item cites a `sourceUrl`" invariant); the #7
      no-doc severity rule; AI-gate *verdict→route* wiring (verdict is LLM,
      routing on it is deterministic); issue dedup/lifecycle (gh mocked at the
      boundary); D's fork/close branch-naming + open-before-close ordering +
      idempotency guard (git/gh = external boundaries → mock or scratch repo).
    - **Orchestration plumbing tests with *stub agents*.** Replace each
      `claude-code-action` job with a stub emitting a *canned* schema / plan /
      verdict fixture, then assert the whole chain runs end-to-end **without
      real LLMs**: Step 0 → issue created → A comment → B↔C jobs (artifact
      passing) → D forks → PR `Closes #issue` → issue auto-closes on merge.
      Catches the bulk of bugs (chaining, artifacts, lifecycle, ordering)
      cheaply; the LLM is the *only* thing we can't fixture.
    - **LLM capability → live, on real bumps:**
      1. **First live test = signoz `0.122.0 → 0.128.0`** (`helmv3` major on
         `infra/observability/Chart.yaml`). Chosen because: a real **0.x-major**
         (x: 122→128 → exercises the deterministic route + the 0.x semver
         handling from #1); **low blast radius** (observability backend, not the
         product); helm-managed so it *also* exercises the helm values-diff
         carryover (#2); and it **won't early-exit** — `Chart.yaml:19` ("0.122.0
         ships SigNoz app v0.122.0 — initial pin") is stale on bump → a concrete
         category-(b) doc-coherence fix, so it drives a real (docs-ish) D path.
         *Caveat:* it bundles general-pipeline + helm-carryover coverage (fine,
         just don't assume which on failure).
      2. **Full-path guarantee = helm v4 / #814.** A known real mandatory
         migration that won't downgrade → guarantees exercising
         D/fork/close/§6a-on-the-claude-PR. Run *after* signoz + plumbing green.
    - **Order:** deterministic + stub-agent plumbing → signoz (live #1) → #814
      (live #2, full path).
    - **Optional/deferred:** a small **eval fixture set** (known past bumps +
      expected breaking-change findings) to regression-test A's enrichment.
      Defer unless A's quality proves wobbly.
11. ✅ **RESOLVED — trigger + concurrency. The issue-creation event *is* the
    dispatch** (no separate `repository_dispatch` needed — the issue-as-spine
    model already gives decoupling + dispatch-once + rebase-immunity).
    - **Step 0** (`on: pull_request: [opened, synchronize, reopened]`,
      job-gated to `startsWith(head_ref, 'renovate/')`): lightweight, runs on
      *every* renovate PR (the AI gate lives here). **Idempotent** — first
      checks "does a spine issue already exist for this dep+version?" → if yes,
      skip (the #9 guard; so `synchronize`/rebases re-hit Step 0 but do nothing).
      Routes via Renovate's update-type label (#1) + AI gate for minor/patch.
      - pipeline-eligible → **create the spine issue** (`bump-supervisor` label
        + a **structured context block in the body**: dep/from/to/PR#).
      - green minor/patch → stamp mergeable, no issue.
    - **Pipeline** (`on: issues: [opened, labeled]`, guarded to the
      `bump-supervisor` label): one run, jobs `A → B1 → C1 → … → D` chained by
      `needs:` + artifacts (#4/#7). Triggered **exactly once** because Step 0
      creates the issue once → structurally immune to Renovate rebases
      ("nothing external re-fires it" becomes a fact, not a hope).
    - **Context source:** the pipeline reads its context from the **issue body**
      (the fenced block Step 0 wrote), not a typed payload — fine, since the
      issue is the spine and must carry that context anyway. **Guard:** a stray
      `bump-supervisor` label on an unrelated issue with no context block →
      pipeline no-ops (stops a manual mislabel misfiring).
    - **Concurrency:** `group: bump-<dep>-<major>`, **`cancel-in-progress:
      false`** — never kill an in-flight migration (and once D forks, the
      pipeline is on the `claude/*` branch, decoupled from Renovate's anyway).
    - **D's claude PR:** a normal PR → existing CI + §6a fire on `claude/*` as
      usual; §6a stays suppressed on `renovate/*` (#7).
    - **Chaining:** jobs-in-one-run — *not* a workflow-per-agent, *not*
      self-re-trigger (confirms #4/#7). The "major-label filter" is Step 0's
      routing *input*, not a workflow-level gate.
12. ✅ **RESOLVED — naming + layout + ADR. Stem = `breaking-bump`** (explicit to
    an outsider; "breaking dependency bump"). **Renames the whole system from the
    abstract "bump supervisor" — these names supersede every `bump-supervisor` /
    `bump-needs-human` / `bump-enhancement` reference earlier in this doc** (the
    doc-wide rename sweep happens in the self-review pass — task #23).
    - **ADR-0068 "AI-driven breaking-bump migration pipeline"** (highest existing
      is 0067). **Supersedes/absorbs ADR-0067** (internal-tool upgrade-PR
      enrichment): the helm-enrich pipeline becomes a *special case* of Agent A;
      the values-diff carryover survives, so 0067's logic is re-homed, not lost.
      0067 status → "Superseded by ADR-0068." Per ADR-0001 §7 it **merges first**,
      before any workflow code, updating `docs/adr/INDEX.md` in the same PR
      (`registry-coherence` gate).
    - **Workflows** (`.github/workflows/`): `breaking-bump-dispatch.yml` (Step 0
      router, `on: pull_request`), `breaking-bump.yml` (the pipeline,
      `on: issues`), `breaking-bump-tests.yml` (script CI). The
      `helm-bump-enrich*.yml` trio is migrated/absorbed during implementation
      (plan details; not necessarily deleted day one).
    - **Scripts:** `scripts/helm-enrich/` → generalized to
      **`scripts/breaking-bump/`** (Step 0 routing, schema validation, issue
      lifecycle, fork/close, ai-gate wiring); `test_*.py` alongside per repo
      convention; helm `valuesdiff.py` kept as the helm special-case module.
    - **Agent prompts:** `.github/breaking-bump/prompts/{agent-a,agent-b,agent-c,
      agent-d,ai-gate}.md` — versioned/reviewable, not inline in YAML.
    - **A→B schema:** `scripts/breaking-bump/schema/ab_contract.schema.json`.
    - **Registry:** keep `infra/tools-upgrade-sources.yaml` in place (renaming
      churns refs); starts **empty** as the reactive override (#2).
    - **Labels — two orthogonal axes** (supersedes the welded `bump-needs-human`):
      - *Kind* (base label): **`breaking-bump`** — the spine/tracking issue
        (means "*potential* breaking bump under supervision"; applied at creation
        before A confirms — non-breaking ones close fast). **`post-bump-
        enhancement`** — the category-(c) optional follow-up (the `post-` makes
        the "do later, separately" deferral explicit).
      - *Status* (cumulative): **`needs-human`** — stacks *on top* of any base
        label; added on escalation/failure, removed on resolution. Enables a
        one-view worklist filter ("everything that needs me") across all kinds,
        and is reusable by any future escalating automation. The base label
        supplies the "needs-human *for what*" context.
      - *Origin* (umbrella): **`ai-driven`** — marks the issue as
        machine-generated. Gives the "all pipeline issues" view the kind-labels
        alone couldn't, *and* is a **repo-wide origin convention** (intended to
        be retrofitted to other AI automations — §6a, future ones — so "show me
        everything a machine touched" becomes a portfolio-wide transparency
        filter, fitting the AI-fleet repo, ADR-0001). **Caveat:** it only earns
        its keep if adopted repo-wide; if *only* this pipeline sets it, it's
        redundant with OR-ing the kind-labels. It is **not** the dedup key.
      - **Dedup key (#6) stays `breaking-bump` + dep** (kind + dep), not the
        `ai-driven` umbrella.
      - **Final label set (4 labels, 3 axes):** `ai-driven` (origin) ·
        `breaking-bump` / `post-bump-enhancement` (kind) · `needs-human`
        (cumulative status).
13. ✅ **RESOLVED — cost guardrails throttle *breadth*, not *depth*.** Depth is
    the value (the 6-round B↔C loop on a hard migration is what we pay for), so
    every lever targets frequency/scope; per-bump caps stay generous.
    Cost profile: Step 0 = **zero tokens** (deterministic); AI gate = high-
    frequency / low-cost (one changelog-only call per minor/patch); full
    pipeline = low-frequency / high-per-bump (impacted majors only).
    - **#1 lever — ship on a restricted subset; `signoz` ONLY first.** This is
      the first step of the **Rollout strategy** section (the allowlist as a
      *confidence ratchet*): the pipeline ships scoped to exactly one dep
      (`packageRules`/path filter), proves itself end-to-end (the #10 first live
      test), then expands **one dep at a time** until promoted to the whole
      tree. Not just a cost cap — it's how the pipeline is adopted at all.
    - **Throttle at the source.** The pipeline only fires on Renovate PRs, so
      `prConcurrentLimit` *is* the rate limiter — lower it for the lab phase
      (5 → 2–3); reversible one-liner in `renovate.json`.
    - **Per-bump caps already exist** — B↔C = 6 (#4), §6a = 5 — kept **generous**
      (depth = value). No new work.
    - **Dark feature flag** (`breaking-bump` enabled, with an expiry date per
      CLAUDE.md flag discipline) = instant kill switch.
    - **Spend observability, not a hard budget.** `claude-code-action` reports
      usage; log per-stage + surface per-bump cost as a comment on the spine
      issue. Watch with eyes open rather than pre-capping.
    - **Deferred:** a hard token-budget accountant (cumulative-spend halt) is
      real machinery the four levers above make unnecessary for the lab. YAGNI;
      revisit only if the numbers surprise us.

---

## Deferred ideas (explicitly out of scope now — don't forget)

- **Per-dependency semver-trust registry.** For each direct dep/tool: *is it
  semver? how well is semver respected/trusted?* Would live alongside today's
  `infra/tools-upgrade-sources.yaml` registry. **Deferred** (2026-06-12): real
  curation work for a marginal *core*-pipeline gain — the pipeline works without
  it. Its actual payoff is **cost-tuning the AI gate** later: a highly-trusted
  dep + patch → skip the smell test entirely; a known semver-violator →
  escalate harder. An optimization, not a capability. Priority is a working
  pipeline first.
- **Generalize "consumer-rates-producer review/fix" as a reusable pattern.**
  Here it collapses to one doc-bound loop (#5) so it isn't worth building, but
  the uniform principle may be valuable in a future session / other repos.
- **Human-guided B mode (human as unconstrained director).** On failure, let a
  *maintainer-authored* comment on the issue trigger a B-revision in-thread,
  instead of the v1 manual-takeover path (#9). The human isn't bound to C's
  narrow mandate — they redirect freely (add context, change direction,
  override A). This does **not** reopen the autonomous-ping-pong footgun: the
  trigger is gated on `comment.author == maintainer` (bots ignored), so the
  rule stays "no *autonomous* re-fire," with deliberate human guidance as the
  exception. **Deferred** (2026-06-12): a UX upgrade on takeover, not a missing
  capability — build/prove the autonomous pipeline first. **Cheap constraint to
  honor now so we don't block it:** when the autonomous loop gives up, leave the
  issue + claude PR in a clean, resumable state (plan/artifacts posted to the
  issue) so a later human-triggered B-revision can attach without rework.
