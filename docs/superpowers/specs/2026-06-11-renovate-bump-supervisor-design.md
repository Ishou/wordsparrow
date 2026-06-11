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
   - **Escalation (cap hit or stuck):** label `bump-needs-human` (reuse Gate
     A's label) + comment summarizing unresolved findings → STOP. Never
     auto-proceed to D.
   - **On approval:** the run dispatches D (fork `claude/<dep>-vN`, close the
     Renovate PR, implement, open the claude PR → real §6a on the code).
5. ✅ **RESOLVED — ratings are ascending (consumer rates producer), never
   self-rated.** Self-rated confidence is an unreliable vibe; instead every
   output is judged by its **independent downstream consumer**:
   **B→rates→A, C→rates→B, §6a→rates→D.** No agent grades its own homework.
   - **B rates A** (sufficiency-to-plan). B is the right judge because B has to
     *plan from* A's context — thin enrichment is felt directly. This **is
     Gate A**, now consumer-judged: B's first act is to rate A's output; `low`
     or `none` → `bump-needs-human` + STOP (B doesn't waste effort planning).
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
   - **Optional non-loop signal — D rates C:** "was the approved plan actually
     implementable when D hit the code?" Surfaced in the PR as a quality
     signal, **not** a feedback loop (keeps the pipeline linear). [Keep vs skip:
     pending — see note.]
6. **Fork + close + the "ignored update" fallback.** Exact mechanics of D's
   fork/close; and since closing a Renovate PR makes Renovate stop proposing
   that update, how do we keep the claude PR as the durable tracker (note on
   the dashboard? a `recreateWhen`?).
7. **§6a-on-Renovate behavior, final answer.** Today §6a runs on Renovate PRs
   and clobbers (PR #816, which would have disabled it, was closed as the wrong
   fix). With this pipeline, A/B/C run on the Renovate PR instead — so does §6a
   still run on Renovate PRs at all, or is it suppressed there in favor of the
   supervisor (and only runs on the claude PR)?
8. ✅ **RESOLVED — Agent A subsumes `helm-bump-enrich`.** The general supervisor
   absorbs the helm-specific pipeline (it becomes a special case of A), not run
   alongside. See #2.
9. **Error handling** — A fetch failures; B can't plan; B↔C deadlock; D's
   implementation fails CI; §6a cap on the claude PR; partial/abandoned claude
   PRs (and the dropped Renovate update).
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
