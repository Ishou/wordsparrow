# Co-op validated-letter score

## Summary

Show each player's **validated-letter count** (their "score") on their tag in
multiplayer (co-op) games. A player's score is the number of locked grid cells
attributed to them — the same attribution that already tints the board by
finder in ADR-0086. The count appears live on the in-game roster chips and as a
ranked tally on the Résultats finish screen.

This is a **frontend-only** feature: the data (`lockedPositions[].lockedBy`) is
already on every lobby snapshot and every `wordLocked` frame. No backend,
schema, wire, or persistence change.

## Scoring semantics (decided)

- **Score = `count(lockedPositions where lockedBy === sessionId)`** — validated
  *letters*, not words.
- Attribution reuses ADR-0086's word-completer model: the player whose write
  completes a word is credited with every cell that word locks, minus crossing
  cells a teammate already locked (first-writer-wins). Consequence: a player's
  score **always equals the number of cells rendered in their colour** on the
  board. The score and the board never disagree.
- Co-op only. Solo grids carry no `lockedBy`, so this surface never appears
  there.
- A player with no locked cells scores `0` (shown explicitly, not hidden).

Worked example (from ADR-0086) — `POMME` across / `PUIT` down share the `P`:
player 1 completes `POMME` → P1 = 5; player 2 completes `PUIT` (shared `P`
already P1's) → P2 = 3.

## Architecture

One pure, unit-tested helper is the single source of truth for the tally:

```ts
// frontend/src/domain/game/playerScores.ts
import type { SessionId } from '@/domain/game';

export function tallyValidatedLetters(
  lockedPositions: ReadonlyArray<{ lockedBy: SessionId }>,
): ReadonlyMap<SessionId, number>;
```

It counts occurrences of each `lockedBy`. It reads only the `lockedBy` field, so
it is agnostic to the rest of the `LockedCell` shape.

Both screens already have `lockedPositions` in scope. Each calls the helper in a
`useMemo` and passes the resulting `ReadonlyMap<SessionId, number>` to the
presentational component. No new data is threaded beyond what already flows.

## Live roster chips — `PlayerStrip`

`frontend/src/ui/v2/multiplayer/PlayerStrip.tsx`

- New optional prop: `scoresBySessionId?: ReadonlyMap<SessionId, number>`.
- Each chip renders a small tabular-nums count between the pseudonym and the
  status dot. The count is shown **always, including `0`** — the tag always
  carries a score.
- Visual: a subtle jade numeral inside the existing frosted pill (not a loud
  badge). It must not disrupt the chip's rounded-pill shape or wrap.
- **Order stays join-order.** The live strip never re-sorts by score — chips
  must not jump around as counts tick up.
- Accessibility (ADR-0050): the visible digit is wrapped in a `<span>` carrying
  an `aria-label` such as *"Alex : 12 lettres validées"* and the digit glyph
  itself is `aria-hidden` to avoid a screen reader double-reading the number.
  The count updates are not announced via a live region (it would spam on every
  lock); the roster already re-renders and the board glow is the primary cue.

`LiveCoopScreen.tsx` already builds `lockedByAt` from `lockedPositions`; it adds
a sibling `useMemo` calling `tallyValidatedLetters(lockedPositions)` and passes
the map to both `PlayerStrip` render sites (mobile + desktop).

## Résultats finish screen — `ResultatsScreen`

`frontend/src/ui/v2/multiplayer/ResultatsScreen.tsx`

- The route (`lobby.$lobbyId.tsx`, COMPLETED branch) passes a new prop
  `lockedPositions={lobby.game?.lockedPositions ?? []}` (the `game` session is
  still embedded while COMPLETED). The screen computes the same tally via the
  shared helper.
- Each participant row gains a right-aligned *"N lettres"* value. The existing
  host badge stays.
- **Rows are sorted by score descending**, ties broken by original join order
  (stable sort over the incoming `players` array). The finish screen reads as a
  leaderboard, unlike the stable live strip.
- The card's `contribTitle` stays; the per-row value turns the "who was here"
  card into a "who found what" tally.

## ADR

ADR-0072 carries an explicit *"co-op finish: no scores — versus mode is a
deferred follow-up"* note, and `ResultatsScreen.tsx` repeats it in a comment.
This feature adds a co-op score, so:

- **ADR-0101** (new) records the decision: co-op score = validated-letter count
  via ADR-0086 `lockedBy` attribution; shown on the live roster and the
  Résultats leaderboard; frontend-only (no new wire). It amends ADR-0072's
  "no scores" note (this is a *collaborative* contribution tally, not the
  deferred *versus/competitive* mode) and references ADR-0086 and ADR-0050.
- `docs/adr/INDEX.md` gains the ADR-0101 entry in the same PR (registry
  coherence gate).
- The stale comment in `ResultatsScreen.tsx` is updated to point at ADR-0101.

## i18n

New keys under the existing `v2.multiplayer` namespace (French, tutoiement per
project copy rules), added to every locale bundle the app ships:

- Live chip aria: `v2.multiplayer.presence.aria.score` →
  interpolates `{name}` and `{count}` → *"{name} : {count} lettres validées"*.
- Résultats row value: `v2.multiplayer.resultats.letterCount` →
  interpolates `{count}` → *"{count} lettres"* (with a singular/plural rule if
  the i18n layer supports one; otherwise "lettre(s)" is out of scope — pick the
  plural form, counts of 1 are rare and non-critical).

Exact key placement follows whatever structure `frontend/src/ui/i18n` already
uses; no new namespace is introduced.

## Testing (TDD)

- **Unit — `tallyValidatedLetters`** (write first, watch fail):
  - empty `lockedPositions` → empty map;
  - single player, N cells → `{player: N}`;
  - two players → correct split;
  - crossing example (P1 completes POMME, P2 completes PUIT sharing `P`) →
    `{P1: 5, P2: 3}` given the diff-shaped `lockedPositions` the server sends.
- **Component — `PlayerStrip`**: renders each chip's count; renders `0` for a
  player absent from the score map; the count `<span>` exposes the score
  `aria-label`; chip order is unchanged by scores.
- **Component — `ResultatsScreen`**: renders per-row "N lettres"; rows are
  ordered by score descending; equal scores preserve join order; host badge
  still shows.
- Update the existing `PlayerStrip` / `ResultatsScreen` / route tests and mock
  handlers that construct these props.

## Scope / delivery

- Frontend-only; well under the 400-line diff cap.
- **Wave 1 — ADR PR:** ADR-0101 + INDEX.md entry (governance-only).
- **Wave 2 — implementation PR:** `playerScores.ts` + `PlayerStrip` +
  `ResultatsScreen` + `LiveCoopScreen` + route wiring + i18n + tests. Bundles
  the spec doc. Merges after Wave 1.
- No new dependency, no new bounded context, no auth/authz surface.

## Non-goals

- Competitive / versus mode, per-player win conditions, or any change to who
  *can* type where. This is a passive tally of existing locks.
- Per-letter authorship ("letters I personally typed correctly"). Rejected: it
  needs new server-side per-cell author tracking and would make the score
  disagree with the board colours.
- Persisting or leaderboarding scores across games.
- Any solo-grid surface.
