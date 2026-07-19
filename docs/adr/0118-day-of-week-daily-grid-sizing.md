# ADR-0118: Day-of-Week Daily Grid Sizing

## Status
Proposed

## Context
Daily puzzles are a single fixed size (22×15, ADR-0095). Moving the daily to
the distilled generator (ADR-0117) surfaced two facts, both measured on the
real corpus with the recurrence cooldown (ADR-0031 as amended by #1659) over a
14-day sequential walk:

- A **22×15** distilled daily is slow (~155 s median) and, before the
  cooldown-fallback landed, failed to satisfy the cooldown on 8/14 days —
  large airy grids lean on long words that mostly have a single clue.
- A **15×12** distilled daily is ~6× faster (~30 s median) and far easier to
  fill under cooldown (11/14 vs 6/14 pre-fallback), with the same airiness
  (~18% black) and long answers (up to the full width).

We want the everyday grid to be reliable and quick, and a bigger, more
ambitious grid as a weekly event — the *mots fléchés* magazine convention of a
larger Sunday grid.

## Decision
The distilled daily is sized by day of week:

- **Sunday → 22×15** (the big showpiece), aligned to the **Europe/Paris**
  calendar so it lands on the players' Sunday.
- **Any other day → 15×12** (the compact weekday grid).

`dailyGridSize(date)` (`:grid:application`) is the single policy; the size is
passed per date through `GridGenerationPort.generate(width, height)` and
overrides a **bare** base (`distilledDailyBaseConstraints`, no ADR-0095 dense
knobs — the backoff distiller supplies airiness). The sizing is **gated with
the `GRID_DAILY_DISTILL` toggle**: while distillation is off, the daily keeps
its current 22×15 dense constraints, so this change deploys dark and the
sizing goes live together with the distilled flip.

## Consequences
- Weekday dailies become smaller and much faster to pre-generate; the Sunday
  window run costs more but is one date.
- The stored `Grid` already carries `width`/`height`; the frontend renders any
  size from the puzzle payload, so no schema change — a 15×12 grid is more
  square than 22×15 and must lay out cleanly (verified separately).
- The dense (pre-distillation) path is unchanged, so nothing shifts until the
  `GRID_DAILY_DISTILL` flip.
- "Europe/Paris Sunday" is the *intent*; `dailyGridSize` reads the daily date's
  day of week, which is correct as long as daily dates track the players'
  calendar. If the pre-gen's date basis is UTC, the big grid lands on the
  UTC-Sunday date (the same calendar Sunday save a short late-night window) —
  a follow-up can move the pre-gen date basis to Europe/Paris if that window
  matters.
