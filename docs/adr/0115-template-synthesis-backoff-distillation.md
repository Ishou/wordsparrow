# ADR-0115: Template Synthesis + Backoff Distillation for Long-Word-Rich Grids

## Status
Proposed

## Context
The ADR-0039 generator produces grids by seeding a black-cell layout, then
filling it with a CSP, then **perturbing** (adding black cells) whenever a
sparse seed fails to fill within budget. That perturbation loop is load-bearing
for fillability but it *densifies* and *clusters* the layout — converging on
~24–26% black with a ~25–37% two-letter-word share. Published French *mots
fléchés* are airier (~18%) and longer-worded (mean ~5.3, few 2-letter words).

A long investigation (in-session, on the real production corpus) established:

- **Word count is a layout property, not a fill-order one.** MRV/LCV fill is
  length-agnostic; "place long words first" cannot change which lengths exist.
  Confirmed by measurement and by the ADR-0015→0039 history (greedy word-first
  construction and deterministic slot-plans were both abandoned for exactly this
  reason). ADR-0114-era best-of-N-by-coverage is near the *ceiling of the
  stochastic seeder*, not a fundamental limit.
- **Forcing long structure backfires.** Raising anchor counts / adding vertical
  anchors (built and measured) yields *fewer* long words and slower generation —
  the ADR-0095 densification trap, now confirmed on both axes.
- **A real magazine template fills from our corpus with zero perturbation**, and
  fills in **unlimited distinct ways** (30/30 sampled solutions distinct; ~12
  distinct words per slot). So a single fillable template is an inexhaustible
  puzzle source; a small library gives large variety.
- **We can synthesize professional-quality templates at any size.** A
  build-checked "spread" constructor (anti-clustered blacks, run-length capped)
  produces valid templates matching the magazine profile (≈18% black, mean word
  length ≈6, <13% two-letter). Generalizing to any grid size required a
  **structural lexicon** (padded to cover every length via `Lexicon(maxLen=…)`)
  so the corpus-length constraint never nulls the mid-construction build check —
  only genuine structural validity gates placement.
- **The binding limit is the corpus, not the generator.** Synthesized rich
  templates fill only where the vocabulary supports the crossings. Measured on
  the real corpus, **backoff distillation** (start from a dense fillable grid,
  remove black cells one at a time keeping only removals that *still fill*)
  reaches a **fillable 22×15 frontier of ~18.5% black / mean 5.16 / 12%
  two-letter** — essentially magazine quality. The residual gap to the ideal is
  specific missing short forms (bare 3-letter inflections like MET/LUE/SEL/…),
  addressed by ADR-0115's companion corpus enrichment.

## Decision
Adopt a **template-first** generation path alongside the ADR-0039 generator:

1. **`TemplateSynthesizer`** (`grid:domain`) — builds valid, airy, run-capped
   black-cell templates for any size, build-checked throughout against a
   structural (all-length-padded) lexicon. No perturbation, no geometric
   fallback.
2. **Backoff distillation** — given a dense fillable grid, greedily whiten black
   cells, keeping a removal only if the board still fills (real corpus). Yields
   the airiest fillable template at a given size. Runs offline.
3. **Template library** — mine fillable templates offline (rejection-sample /
   distill), store them; at request time pick a library template and fill it
   (best-of-N-by-coverage on top). Because one template fills unlimited ways, a
   small library (tens of shapes) suffices.
4. **Corpus enrichment** — admit the common bare short (3-letter) inflected forms
   the fill starves for; they are dropped today by inflection admission.

Rollout is **daily-path first** (latency-tolerant, offline mining), then a
library for the on-demand path.

## Consequences
- Daily grids become airier and longer-worded (magazine-like) without the
  densification trap, at the cost of an offline mining/distillation step.
- The library decouples expensive fillability search (offline, once per shape)
  from request-time fill (cheap, unlimited variety per shape).
- Adds a structural-lexicon construction technique reusable elsewhere.
- Fill quality at larger sizes tracks corpus richness — enrichment is now a
  first-class lever with a measurable target (the backoff-frontier gap).

## Rejected (measured, not speculative)
- **Fill-order "long words first"** — cannot change word count (slots are
  pre-fixed); proven irrelevant.
- **More/vertical anchoring** — densifies, fewer long words (both axes measured).
- **Greedy word-first construction** — the pre-ADR-0015 generator; abandoned for
  structural-validity and commit-before-fillable failure (ADR-0015/0039).
- **Structural-only distillation** (ADR-0095 `LayoutDistiller`) — thinned without
  a fill check, produced unfillable boards. Backoff distillation differs by
  fill-checking *every* removal.
