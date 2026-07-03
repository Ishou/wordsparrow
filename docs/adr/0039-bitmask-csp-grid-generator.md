# ADR-0039: Bitmask-CSP Grid Generator with Luby Restarts

## Status

Accepted

Supersedes ADR-0015.

## Context

ADR-0015 introduced a three-phase pipeline (Skeleton → SlotPlanner → SkeletonFiller)
to guarantee structural validity and inter-word interlocking. That design solved the
original greedy CSP's layout defects but exposed a different failure mode at production
grid sizes (15×12, min word length 2).

A Wave 1 25-generation benchmark (commit `670798a` on `feat/grid-gen-enhance`) revealed:

- **0/25 first-attempt successes** at 15×12 with the production French corpus.
- All 25 seeds produced the **identical slot plan** — `SlotPlanner` is fully
  deterministic post corpus-aware-length and MRV-arrow-ordering enhancements,
  so it always commits to the same plan for a given grid size.
- Every attempt spent the full 5 s deadline watching the filler confirm that the
  committed plan was unfillable (70 000+ backtracks per puzzle).

Root cause: `SlotPlanner` commits slot lengths without ever proving that the chosen
lengths are *collectively* fillable. The downstream `SkeletonFiller` then exhausts the
search tree for that plan before signalling failure. Because the plan is deterministic,
every retry sees the same unfillable plan and wastes the same 5 s. Production masked
this via the use-case retry loop (different seeds shuffle filler head order), but the
per-attempt success rate was effectively zero.

## Decision

Replace the three-phase pipeline with an **integrated bitmask-CSP** generator that
commits `(black-cell layout, slot length, word)` atomically, never producing a partial
plan that has not been shown extensible.

### Components

**`BlackCellLayout`** (replaces `Skeleton` + `SlotPlanner`)

A 5-pass stochastic procedure that seeds a `CellArray` with black cells satisfying:
- boundary slot convention (alternating black/letter on row 0 and column 0);
- no white run of length 1 (`minLen ≥ 2`);
- no white run longer than `lUseful` (the longest length with adequate corpus coverage);
- approximately `blackRatio` of cells are black.

Layout variability comes from `Random` — no deterministic plan is ever committed.
Perturbation at hot-slot midpoints replaces the old "try a new seed" retry strategy.

**`SlotRegistry`** (replaces `SlotPlanner` slot enumeration)

Reads a `CellArray` and materialises `Slot` objects (position, direction, length) with
their crossing constraints. Slots know their neighbours' crossing positions, which the
CSP uses for constraint propagation.

**`Lexicon`** (new)

Builds per-length, per-position letter-indexed bitmask domains from the `WordRepository`
at construction time. A domain is a `LongArray` where each bit corresponds to one word
in the corpus bucket; intersection constraints become bitwise AND operations, making
arc-consistency propagation O(⌈|domain|/64⌉) per slot per propagation step.

**`BitmaskCsp`** (replaces `SkeletonFiller`)

Standard DPLL-style backtracking CSP solver over `Slot` objects:

1. Initial AC-3 to fixed point before search begins.
2. Variable ordering: MRV (smallest live domain) + degree tie-break + random final
   tie-break.
3. Value ordering: sampled-window LCV (least-constraining value via forward-check of
   neighbours).
4. After each assignment, AC-3 cascade propagation.
5. On failure, undo via a `TrailEntry` log.
6. Stops on deadline, backtrack-budget exceeded, or explicit cancellation.

**`LubySequence`** / Luby restart schedule

`GridGenerator` runs a restart loop. Per-attempt backtrack budget follows the Luby
sequence (Luby/Sinclair/Zuckerman 1993): `1, 1, 2, 1, 1, 2, 4, …`. This sequence is
provably near-optimal for Las Vegas algorithms with unknown runtime distribution,
minimising worst-case wasted work within O(log n) of the best fixed schedule.

On budget exhaustion or timeout, the generator perturbs the layout at hot-slot
midpoints; every `CONSEC_RESEED` consecutive failures triggers a full re-seed.

**`GridGenerator`** (rewritten)

Thin orchestrator: builds `Lexicon` once (lazy, cached), then runs the Luby restart
loop. The public `generate(constraints, random, metrics, timeoutMs, cooldownPolicy)`
signature is unchanged.

### What is removed

`Skeleton.kt`, `SlotPlanner.kt`, `PlanState.kt`, and `SkeletonFiller.kt` are deleted.
No flag-based coexistence is maintained; rollback is by reverting the implementation
commits on this branch.

## Alternatives considered

**Keep `SlotPlanner` but add diversity.** Introducing randomness into slot-length
selection was tried in earlier waves and produced marginal improvement. The root cause
is that any pre-committed plan that happens to be infeasible wastes the entire timeout;
diversity in plan selection cannot fix that without also validating each plan before
committing to it — which is what the integrated solver does.

**AC-3 as pre-processing only (not propagation).** Running AC-3 once before search
reduces domain sizes but does not help after assignments narrow intersecting domains.
Full incremental AC-3 after each assignment is retained.

**Conflict-directed backjumping (CBJ).** Deferred. Chronological backtracking with
Luby restarts handles the production corpus; CBJ should be revisited if a future
benchmark shows the backtrack depth as the next bottleneck.

## Consequences

### Easier

- First-attempt success rate at 15×12 is non-zero on every seed; the deterministic
  all-fail scenario is eliminated.
- Layout diversity is a natural consequence of word-choice propagating to slot-length
  decisions; no separate diversity knob is needed.
- Each component (`BlackCellLayout`, `SlotRegistry`, `Lexicon`, `BitmaskCsp`,
  `LubySequence`) is independently unit-testable with no external dependencies.

### Harder

- `BlackCellLayout`'s 5-pass procedure is more complex than the deterministic
  `Skeleton`; a wrong pass ordering can produce layouts with orphan white cells. The
  existing `BlackCellLayoutTest` suite verifies the structural invariants.
- The bitmask domain representation ties `Lexicon` to the word ordering established at
  build time; adding words after construction requires rebuilding the `Lexicon`.
- The Luby budget parameters (`BASE_BUDGET`, `CONSEC_RESEED` in `GenerationKnobs`)
  are empirically tuned to the French corpus. A corpus change may require re-tuning.

### Different

- `GridGenerator` is now a thin orchestrator; the search logic lives in `BitmaskCsp`,
  not spread across three loosely coupled phases.
- `AttemptOutcome` and `GenerationMetrics` (added to `GeneratePuzzleUseCase`) surface
  per-attempt backtrack counts and timing for observability; ADR-0015's pipeline had
  no equivalent instrumentation.

### Amendment (2026-07-01): white-cell connectivity + half-checked interlocking

Empirical measurement (see `GridConnectivityReproTest`) found the generator
produced a **closed block** — white cells split into a disconnected pocket by
black cells / the border — in ~11-14% of 15x12 grids, on both the current and
pre-scrub corpora (a long-standing latent defect, not a corpus regression).
`BlackCellLayout.canPlaceBlack` gains **Check 6**: a black placement is rejected
if it disconnects the white cells into more than one 4-connected region. Every
placement path (density sprinkle, run-capping, perturbation) routes through
`canPlaceBlack`, so this structurally forbids closed blocks (0% after the guard,
generation success ~95%, unchanged).

Interlocking is **half-checked**, not fully-checked: a letter cell in exactly one
word — sandwiched by black/border on the other axis — is valid mots fléchés,
interior or edge. `GridValidator.uncrossedCells` is relaxed accordingly to flag
only cells in *no* word (unfillable). The prior "interior cells must cross both"
rule was stricter than the genre requires, was never enforced during
generation, and duplicated the always-on `OrphanedLetterCell` check once
relaxed to the same condition — the dead `enforceInterlocking` flag and its
now-redundant `UncrossedCell`-emitting branch are removed from `validate()`.
`GridValidator.uncrossedCells` remains as a standalone predicate for callers
that want the orphan check in isolation (see `GridGeneratorPropertyTest`).

**Follow-up: generator-side Check 1 relaxed to match.** The half-checked rule
was relaxed in the *validator*, but `canPlaceBlack` **Check 1** still rejected any
black that dropped an adjacent white run below `minLen` *on the black's axis* —
which structurally forbade creating an interior single-axis (sandwiched) cell,
pinning generated grids near ~90% interlock (a near-full crossword, not
half-checked). Check 1 is relaxed to the same orphan condition as the validator:
a neighbour may fall to a length-1 run on one axis as long as it keeps a
`≥ minLen` run on the other (it stays in ≥ 1 word); reject only if it would be
orphaned on *both* axes. Measured effect (15x12, 120 grids): interlock 90.6% →
~79%, first-attempt success 114 → 106/120 (retry path via `GeneratePuzzleUseCase`
still 200/200), word-length distribution unchanged — the change makes grids
authentically half-checked, it does not shorten words.

### Amendment (2026-07-03): dead-end words must be ≥ 5 letters

A word whose last cell is a **dead end** — sealed ahead by a black cell and
uncrossed on the perpendicular axis (black or border on both sides) — leaves
its tip letter with no crossing to confirm it. On a short word that is unfair
to the solver and reads as generator laziness. Measurement over 200 seeded
28×20 layouts found ~2.2 short (< 5) dead-end pockets per layout, including
2-letter culs-de-sac; ~95 % are fully interior, ~5 % hug one border with two
black walls. Words ending flush at the grid border stay exempt: the forward
wall must be an actual black cell (a border-forward pocket cannot arise —
its perpendicular walls would be dead blacks and get cleaned up).

Rule: **a word whose last cell is a dead end must be at least 5 letters**
(`GridValidator.DEAD_END_MIN_LEN`, the canonical threshold — it lives in
`validation` because Konsist forbids `validation → generation` imports).
Enforcement mirrors C2 (triples) / C7 (clamps):

- `GridValidator` gains a `ShortDeadEnd` violation (defense-in-depth net).
- `BlackCellLayout.canPlaceBlack` gains **Check 7**: reject a placement that
  walls or shortens a run into a short dead end (forward-wall, side-wall and
  split-shortening cases; candidates are the four neighbours plus the far
  tips of the split right/down runs).
- `SlotRegistry.build` returns `null` for any slot ending in a short dead
  end — the authoritative gate covering seed passes that bypass
  `canPlaceBlack` (orphan repair, dead-black cleanup); the driver perturbs
  as usual.
- Bench regression gate: `GridDeadEndReproTest` (production corpus, default
  28×20 constraints).

Measured effect (28×20, 120 seeds, production corpus): before the rule
**every** generated grid contained short dead-end words (104/104 grids,
842 words, ~8 per grid). After: 0/102. Cost:
first-attempt success 104 → 102/120, p50 latency 266 → 742 ms
(mean 417 → 859 ms) — well within the generation budget; mean word
length 3.79 → 3.87 and interlock 83.8 % → 84.9 % (both slightly up:
culs-de-sac were short and uncrossed by definition).
