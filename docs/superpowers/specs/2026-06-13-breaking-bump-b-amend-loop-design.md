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

- **If `./plan.json` is present (AMEND / B'):** load it. It is your prior plan and the source of truth for everything already decided. Address each item in `./prev-findings.json` by **adding or correcting** entries. **Preserve every existing entry and disposition.** If a C finding shows a prior entry is wrong, either correct it in place (same `dispositions` key) or remove it — but a removal **must** be recorded in `_amendments.removed` with a reason (the guard hard-fails any unaccounted drop). Re-emit the **complete** plan.
- **If `./plan.json` is absent (CREATE / B):** build the plan from `abschema.json` as today, with an empty `_amendments`.
- **Sticky dispositions:** once an item is marked out-of-scope with grep evidence (e.g. `"--force": "not used — 0 helm-flag hits"` under `dispositions`), carry that key **verbatim** into every later round. Do not re-derive it. This is what stops the whack-a-mole and makes late rounds cheap.

The inline `b_round` prompt steps already differ by round (round 1 says "no prev-findings"; rounds 2+ say "address C's findings"); update the rounds-2+ wording to "**amend the existing `./plan.json`** — preserve all entries, only add/correct for C's findings."

### §3. Deterministic monotonicity guard (the testable invariant)

The LLM B↔C loop can't be unit-tested, but the **"never drop a prior entry" invariant can.** Add a pure helper + a workflow gate so a regression in B' fails loudly instead of silently oscillating:

The guard is **maximally strict** (maintainer decision): it covers **every** prior entry — both the keyed `dispositions` and every `a`/`b`/`c` action-list entry — not just dispositions. A prior entry may legitimately disappear from the new plan **only** if B' records its removal in `_amendments.removed` with a reason; an unaccounted disappearance hard-fails the round.

- Formalized `plan.json` schema (see §3a) carries `dispositions: {item: reason}` and `_amendments: {removed: [{entry, reason}]}`.
- `scripts/breaking-bump/plan.py`:
  - `load_plan(path) -> dict`
  - `entries(plan) -> set[str]` — the union of every accountable unit: each `dispositions` key, plus each `a`/`b`/`c` action-list string.
  - `accounted_removals(plan) -> set[str]` — the entries listed under `_amendments.removed` (each with a reason).
  - `assert_monotonic(prev, new) -> list[str]` — returns `entries(prev) − entries(new) − accounted_removals(new)`: prior entries that vanished **without** a recorded removal reason. Empty list = OK. Rewording a `dispositions` *reason* under the same key is fine (the key persists); rewording an action-list *string* counts as drop+add, so a genuine reword must either keep the string or be logged in `_amendments.removed` — the strict default the maintainer chose.
- In each `b_round(N≥2)` job, after B' writes `plan.json` and before upload, run a guard step: if `assert_monotonic(prev_plan, new_plan)` is non-empty, emit `::error::` listing the unaccounted dropped entries and `exit 1` (→ escalate, strictly better than a silent late-round drop). The prior plan is already on disk from §1's download (copy it aside before B' overwrites it).
- `scripts/breaking-bump/test_plan.py`: unit-cover `assert_monotonic` — identical plans → OK; added disposition/action → OK; reworded disposition reason (same key) → OK; **dropped disposition key with no removal record → flagged**; **dropped action-list entry with no removal record → flagged**; dropped entry **listed in `_amendments.removed` → OK**; missing/empty/malformed plan handled without raising.

### §3a. Formalized `plan.json` schema

Today the plan is `{"a":[...], "b":[...], "c":[...]}` with dispositions as free text under `_notes`. Formalize two fields so the guard is mechanical and the sticky-disposition contract is explicit:

```json
{
  "a": ["mandatory step strings…"],
  "b": ["doc-coherence step strings…"],
  "c": ["opportunistic step strings…"],
  "dispositions": { "<breaking-change item>": "<reason, e.g. 'not used — 0 helm-flag hits'>" },
  "_amendments": { "removed": [ { "entry": "<the prior key or action string>", "reason": "<why dropped>" } ] }
}
```

`dispositions` is the keyed sticky map (carried verbatim across rounds); `_amendments.removed` is the escape hatch that makes an intentional drop auditable instead of silent. B (round 1) emits empty `_amendments`.

### §4. Acceptance test — live convergence re-run

The loop is LLM-driven, so the real acceptance criterion is a **live re-run of helm v3.21.0→v4.2.1** after the change: it must **converge (C approves) and open a migration PR**, instead of burning 6 rounds to `needs-human`. State plainly in the PR: the unit test covers the monotonicity guard only; convergence itself is verified by the live re-run, not by CI. (Per CLAUDE.md: type/unit checks verify code correctness, not feature correctness — if it can't be unit-tested, say so.)

### §5. Implementation notes (pinned in cold review)

- **Guard step ordering, per B' round (N≥2):** (1) `download-artifact: plan-round(N-1)` → `./plan.json`; (2) `cp ./plan.json ./prev-plan.json` **before** the "Run Agent B" step; (3) the agent (or stub) overwrites `./plan.json`; (4) a guard step runs `assert_monotonic(load_plan('./prev-plan.json'), load_plan('./plan.json'))`, emitting `::error::` + `exit 1` on any unaccounted drop — placed **before** the existing `Upload plan (round N)` step. Name the aside copy `prev-plan.json` (distinct from C's `prev-findings.json`).
- **Stub path is left passing-trivially:** the `BREAKING_BUMP_STUB` "later round" step keeps `cp plan.round1.json ./plan.json`; since `prev-plan.json` is also `plan.round1.json`, the guard passes trivially. That is intended — the real guard logic is exercised by `test_plan.py`, not the stub chain. The `download-artifact plan-round(N-1)` step runs unconditionally (b_round1's stub also uploads `plan-round1`, so the artifact exists in stub runs).
- **Nothing to migrate from `_notes`:** the committed `agent-b.md` emits only `{a,b,c}`; the free-text `_notes`/`c_findings_disposition` seen on the live helm run were that run's ad-hoc LLM output, not an in-repo shape. W2 simply **adds** `dispositions` + `_amendments` to `agent-b.md`'s emit schema and to `stub_fixtures/plan.round1.json` (empty `_amendments`, one sample `dispositions` entry). No conversion step.
- **`needs:` is transitive-only:** `b_round(N≥3)` does not list `b_round(N-1)` in `needs:`, yet `plan-round(N-1)` is downloadable — artifacts are run-scoped, not `needs`-scoped, and ordering holds transitively (`b_round(N-1) → c_round(N-1) → b_round(N)`). Optionally add `b_round(N-1)` to each `needs:` for clarity; not required for correctness — do not "fix" it as if it were a bug.

## ADR impact

This changes the B↔C loop contract (B' amends rather than re-plans; a new deterministic plan-monotonicity gate). Amend **ADR-0068** with the B'/amend-loop refinement in the same wave as the spec — registries cannot lag the things they register.

## Wave decomposition

- **W1** — ADR-0068 amendment (B'/amend-loop + monotonicity gate) + this spec doc. Governance only.
- **W2** — Implementation: `plan.py` + `test_plan.py` (TDD), the `download-artifact: plan-round(N-1)` step on `b_round2…6`, the guard step on `b_round2…6`, the `agent-b.md` create/amend mode branch, and the rounds-2+ inline-prompt wording. Then the live helm re-run as acceptance.

## Resolved decisions (maintainer, 2026-06-13)

1. **Guard strictness:** maximally strict — the monotonicity guard covers **every** prior entry (`dispositions` keys **and** every `a`/`b`/`c` action-list string), not just dispositions. (§3)
2. **Drop accounting:** drops are permitted **only** when recorded in `_amendments.removed` with a reason; any unaccounted disappearance hard-fails the round. (§2, §3)
3. **Disposition schema:** formalized — `plan.json` gains a keyed `dispositions: {item: reason}` field plus `_amendments.removed`, rather than parsing free-text `_notes`. (§3a)

Architecture also confirmed: keep **B'/amend with C as an independent reviewer** (no role merge — a reviewer that also amends and self-approves would lose the adversarial check).
