# Breaking-bump B↔C loop — B'/amend convergence — design

## Status
Draft for maintainer review.

## Problem

The breaking-bump pipeline's plan loop (ADR-0068) runs Agent B (planner) ⇄ Agent C (reviewer) for up to 6 rounds, converging when C approves B's plan. On the **2026-06-13 helm v3.21.0→v4.2.1 live test** (spine issue #858) the loop **burned all 6 rounds without converging** → `plan-approved` failed → escalated to `needs-human`, no migration PR, ≈ $6.16 spent (vs signoz's ~$2.70 which converged in 1 round).

Agent A was fine — the reliability redesign worked, sourcing was high-confidence and complete. The failure was **B↔C non-convergence**, and the root cause is a wiring bug in `breaking-bump.yml`:

- `c_round(N)` downloads `plan-round(N)` → C reviews the full plan. ✓
- **`b_round(N+1)` downloads only `findings-round(N)` (C's verdict) — NOT `plan-round(N)` (B's own prior plan).** ✗

So every B round **regenerates the plan from scratch** from `abschema.json` + C's latest findings. It patches what C flagged this round and, starting from a blank sheet, silently drops coverage it produced in earlier rounds. The observable signature on #858:

- B produced a complete disposition table in an early round, then a narrower plan later — coverage fluctuated round to round.
- C in round 6 **re-raised items** (`--force`, `--create-pods`, `repo add --no-update`, registry-login `https://`, `--post-renderer`) that B had explicitly dispositioned in a round-2 table.
- Every B round cost ~$0.5–0.6 (a *full* replan), never tapering toward a cheap amend.

This is acute on a dependency with **many breaking changes that are mostly out-of-scope** (helm v4 has ~12+ breaks; this repo uses Helm as a CLI-only tool, so nearly all are irrelevant). B's plan was essentially correct by round 2 (bump 5 `azure/setup-helm` version pins + validate SSA-default + doc coherence), but the loop could never *certify* completeness because each round it re-derived a different subset.

## Goals

- The plan **grows monotonically** across rounds: an entry or disposition produced in round N is never silently lost in round N+1.
- Late rounds get **cheaper** (amend, not full replan), and dense-but-mostly-out-of-scope bumps **converge** instead of exhausting the round budget.
- The "never drop a prior entry" invariant is enforced **deterministically by the workflow**, not left to LLM diligence.

## Non-goals

- Changing Agent A, the deterministic sourcing, or the confidence gate (all validated on the helm test).
- Changing C's reviewing contract beyond optional hardening (C already reviews the full cumulative plan — that side is wired correctly).
- Re-running or auto-applying the helm migration as part of this change.

## Design

### §1. The B / B' split (create vs amend) + the missing download

Agent B becomes two prompt modes, gated on round number — the workflow is already statically unrolled into `b_round1…6`, so this is a per-job variant, not a restructure:

- **B (`b_round1`) — CREATE.** No prior plan exists. Unchanged from today: read `abschema.json`, write `plan.json` from scratch. Does **not** download a prior plan.
- **B' (`b_round2…6`) — AMEND.** Add one step to each of these 5 jobs:

  ```yaml
  - uses: actions/download-artifact@<pinned>   # B's own prior plan
    with: { name: plan-round<N-1>, path: . }
  ```

  This lands the prior plan at `./plan.json` (the `plan-round*` artifacts upload `path: ./plan.json`). B' reads it, **amends in place**, and writes the full updated `./plan.json` (which the existing `Upload plan (round N)` step then publishes as `plan-round<N>`). No collision: `abschema.json`, `prev-findings.json`, and `plan.json` are distinct filenames.

### §2. `agent-b.md` prompt — amend semantics

The shared `.github/breaking-bump/prompts/agent-b.md` (50 lines today) gains a mode branch keyed on file presence:

- **If `./plan.json` is present (AMEND / B'):** load it. It is your prior plan and the source of truth for everything already decided. Address each item in `./prev-findings.json` by **adding or correcting** entries. **Preserve every existing entry and disposition** unless a C finding explicitly says one is wrong (then correct it in place). Re-emit the **complete** plan.
- **If `./plan.json` is absent (CREATE / B):** build the plan from `abschema.json` as today.
- **Sticky dispositions:** once an item is marked out-of-scope with grep evidence (e.g. `"--force": "not used — 0 helm-flag hits"`), carry that disposition **verbatim** into every later round. Do not re-derive it. This is what stops the whack-a-mole and makes late rounds cheap.

The inline `b_round` prompt steps already differ by round (round 1 says "no prev-findings"; rounds 2+ say "address C's findings"); update the rounds-2+ wording to "**amend the existing `./plan.json`** — preserve all entries, only add/correct for C's findings."

### §3. Deterministic monotonicity guard (the testable invariant)

The LLM B↔C loop can't be unit-tested, but the **"never drop a prior entry" invariant can.** Add a pure helper + a workflow gate so a regression in B' fails loudly instead of silently oscillating:

- `scripts/breaking-bump/plan.py`:
  - `load_plan(path) -> dict`
  - `dispositions(plan) -> dict[str,str]` — the keyed out-of-scope/disposition map (the *sticky* part; keyed by the breaking-change item, so rewording the reason is allowed but dropping a key is not).
  - `assert_monotonic(prev, new) -> list[str]` — returns the list of disposition **keys present in `prev` but missing from `new`** (empty list = OK). Action-list entries (`a`/`b`/`c`) are checked advisorily (a warning, since B' may legitimately consolidate wording); dispositions are checked strictly.
- In each `b_round(N≥2)` job, after B' writes `plan.json` and before upload, run a guard step: if `assert_monotonic(prev_plan, new_plan)` is non-empty, emit `::error::` listing the dropped keys and `exit 1` (→ escalate, which is strictly better than a silent late-round drop). The prior plan is already on disk from §1's download (copy it aside before B' overwrites it).
- `scripts/breaking-bump/test_plan.py`: unit-cover `assert_monotonic` (identical plans → OK; added disposition → OK; reworded reason same key → OK; dropped disposition key → flagged; missing/empty plan handled).

### §4. Acceptance test — live convergence re-run

The loop is LLM-driven, so the real acceptance criterion is a **live re-run of helm v3.21.0→v4.2.1** after the change: it must **converge (C approves) and open a migration PR**, instead of burning 6 rounds to `needs-human`. State plainly in the PR: the unit test covers the monotonicity guard only; convergence itself is verified by the live re-run, not by CI. (Per CLAUDE.md: type/unit checks verify code correctness, not feature correctness — if it can't be unit-tested, say so.)

## ADR impact

This changes the B↔C loop contract (B' amends rather than re-plans; a new deterministic plan-monotonicity gate). Amend **ADR-0068** with the B'/amend-loop refinement in the same wave as the spec — registries cannot lag the things they register.

## Wave decomposition

- **W1** — ADR-0068 amendment (B'/amend-loop + monotonicity gate) + this spec doc. Governance only.
- **W2** — Implementation: `plan.py` + `test_plan.py` (TDD), the `download-artifact: plan-round(N-1)` step on `b_round2…6`, the guard step on `b_round2…6`, the `agent-b.md` create/amend mode branch, and the rounds-2+ inline-prompt wording. Then the live helm re-run as acceptance.

## Open questions for the maintainer

1. **Guard strictness** (§3): strict on keyed *dispositions*, advisory (warn-only) on *action-list* entries — or should action-list shrinkage also hard-fail? Advisory keeps B' free to consolidate wording; strict is safer but risks false-fail on legitimate rewording.
2. **Drop accounting:** instead of forbidding drops outright, should B' be allowed to drop an entry if it records the removal + reason in a `_amendments.removed` field (which the guard then accepts)? More flexible, slightly more prompt surface.
3. **Plan schema for dispositions:** today dispositions appear as free-text under `_notes`/`c_findings_disposition`. The guard needs them keyed by breaking-change item. Do we formalize a `dispositions: {item: reason}` field in the plan schema (cleaner guard, small prompt change), or have the guard parse the existing `_notes` shape?
