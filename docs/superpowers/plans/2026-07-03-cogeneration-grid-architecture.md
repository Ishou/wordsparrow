# Co-generation grid architecture — checkpoint (2026-07-03)

## Goal

Replace layout-first generation for the daily with a human-designer sweep:
words are placed and **black cells are emitted as word-end consequences**,
never pre-committed. Maintainer direction: this is the yearned-for
architecture ("follow what a human designer does"); 2-letter words remain
available but only as last-resort fillers — which this architecture gives
by construction.

## Why (evidence, all from 2026-07-03 exploration)

- The layout-first CSP is an attractor at ~26% definition cells at 28×20;
  print mots fléchés run 18.3–22.2% (fortissimots n°21/77/50 measured).
- Every seed-side lever was falsified: DEFAULT_BLACK_RATIO is a no-op
  (run-capping dominates), L_TARGET raises (sym + per-axis) get confiscated
  by blacken-perturbation, min3 structurally infeasible, LayoutDistiller
  (all variants: bounded/unbounded/AC-3/supply-floor/±anchors/±cooldown,
  gates to 30s, deep-search 120s) infeasible or worse — static fillability
  proxies cannot capture crossing feasibility.
- Only selection works WITH the attractor: best-of-4 over
  (anchorCount=3 + lTargetH=11/V=8) = 23.9% avg / 25.2% max under real
  cm=8 rotation (vs 28.0% live on 2026-07-03). That is the interim ship
  candidate; per-axis caps + LayoutAnchorer are implemented in this
  worktree (GridConstraints.lTargetHorizontal/Vertical, anchorCount/
  anchorLength, distillBudget — distiller is falsified, do NOT ship it).
- Cooldown ablation: rotation costs only ~0.4–0.5pp density — geometry
  dominates; multi-clue fix (#1276) keeps it that cheap.

## Prototype state (CoGenerationProbeTest.kt, grid/domain test, @Tag bench)

Row sweep with flexible-end vertical prefixes over Lexicon bitmasks:
- per-column masks per candidate length, letters legal iff some completable
  word fits the remaining depth window; termination legal iff prefix is a
  complete unused word;
- across words picked by maximin column-richness among ~12 sampled
  candidates (uniform random = instant death: rare prefixes strangle);
- end-separator rule: an across word's boundary must land on the border or
  a terminable column (missing this killed 100% of runs at row 1);
- bounded cross-row backtracking (row stack, 40 steps);
- orphan escape valve: fresh column may host an across-only cell (vertical
  run 1) with forced black below, per-row budget 4.

Verified progression: v0 died r1 (separator rule missing) → died r2 →
current dies r3–r5 of 20 with ~6s attempts. Opening (row 0 alternating
def/letter with hosting rules) works; midgame is the open problem.

## v1 findings (per-cell DFS, 2026-07-03 late)

The maintainer's inflection-retreat lever (MANGERAIENT stuck → retreat to
MANGER/MANGEREZ, committed letters stay) is generalized in v1 as
flexible-end prefix masks on BOTH axes with per-cell letter choice — a
word's end is decided only when a separator lands, so "retreat" is free.
Three search architectures (greedy rows, backtracking rows, per-cell DFS
at 400k nodes) all stall at rows 3–5: pure density-greed keeps all 28
columns mid-word so terminable columns vanish. Untested next lever
already coded (v1.1, run killed): "designer rhythm" — sample a target
length per word and prefer ending once reached, keeping separator-ready
columns plentiful. The probe validates end-state with SlotRegistry.build;
hosting rules (row-0 across runs, border bends) are not yet enforced
in-sweep.

## Next design steps (in order)

1. **Real in-row search**: DFS over (segmentation × word choice) with the
   column-viability propagation, instead of greedy first-fit + whole-row
   retries. Beam or bounded DFS; the maximin scorer becomes the ordering
   heuristic.
2. **Terminability rhythm**: stagger vertical word starts (choose vertical
   target-length windows at start time, e.g. commit to 3–6-row bands per
   column region) so every row has plentiful terminable columns for
   separators. The all-columns-in-flight uniformity is what makes rows 3–5
   over-constrained.
3. Then: measure natural density; wire cooldown/theme/dedup semantics
   (WordAcceptor equivalents); ADR (new generation mode beside ADR-0039);
   offline daily budget (minutes are fine).

## Hosting rules that bind the sweep (from SlotRegistry)

- Across start (r,c): black at (r,c−1), or c==0 with black at (r−1,0).
- Down start (r,c): black at (r−1,c), or r==0 with black at (0,c−1).
- Row-0 across runs >1 are impossible (their non-first letters' verticals
  are unhostable) → row 0 = alternating def/letter, like print.

## Interim ship (pending maintainer go)

Daily pre-gen path: best-of-4 selection over stack constraints
(anchors=3, lTargetH=11, lTargetV=8) → 23.9%/25.2% max. Player-request
path unchanged. Exploration bench (DensityExplorationBenchTest) becomes
the regression gate; feasibility-gate protocol per
feedback-bench-feasibility-gate memory. Remaining gap to print after
interim: sharing optimizer (pair word-starts on shared def cells; ours
1.37–1.43 vs print ~1.7) and/or frontend def-cell restyle (print def
cells are white).

## v2 findings (row-DP engine, 2026-07-03 evening)

Engine rewritten: exact per-row DP (regular-language intersection over
per-position allowed letters; boundaries only on terminable columns) +
backward realization sampling + reservation semantics + structural print
rules (row 0 alternating; top-band/bottom-band/left-column short verticals;
no clump blacks; staggered 3-length bands; weighted 4-7 word lengths) +
landing-flexibility selection + exact one-row-DP lookahead + row-level
backtracking (80) + attempt restarts.

Frontier trajectory: rows 2 -> 3 -> 7 -> 14, then STALLED at 13-14/20
across four runs (stall rule triggered). Boards through row 13 are
print-quality (SOUTIENNE / BAPTISE / NAGERA / RADEAU / AUSTRALE ...).
Remaining wall: multi-row global consistency — failures at row ~13 are
caused by commitments 2-4 rows earlier (reserved-column landing patterns,
orphan-forced blacks); a one-row oracle cannot see them.

Next candidates (reassessment):
1. Beam search over rows (width 4-8, keep best boards by flexibility +
   next-row-DP): attempts cost ~40ms, beam ~seconds/board — cheap, the
   natural scale-up. RECOMMENDED first.
2. Two-row lookahead (sampled r+1 realization + r+2 DP oracle).
3. Combine with best-of-N at board level for density selection once
   completion is reached.
