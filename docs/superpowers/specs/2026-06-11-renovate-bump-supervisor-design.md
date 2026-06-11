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
10. **Testing** — deterministic parts (schema validation, the trivial/impacted
    classify wiring, fork/close shell) get unit tests; LLM parts validated on a
    real major bump. What's the first real test case (helm v4 #814 is a
    candidate)?
11. **Trigger + concurrency** — `pull_request` event types, the major-label
    filter, concurrency keys, and how A/B/C/D chain (separate workflows vs jobs
    vs self-re-trigger).
12. **Naming + layout + ADR** — workflow file names, agent-prompt locations,
    registry location; this standing automation likely warrants its own ADR
    (sibling to 0067).
13. **Cost guardrails** — A runs on every major Renovate PR; B/C/D per impacted
    major. Any rate/scope limits to avoid surprise token spend during the lab
    phase?

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
