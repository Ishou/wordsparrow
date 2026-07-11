# Co-op Validated-Letter Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each player's validated-letter count on their tag in co-op games — live on the roster chips and ranked on the Résultats finish screen.

**Architecture:** Pure client derivation. A shared helper counts `lockedPositions[].lockedBy` (ADR-0086 attribution) into a `Map<SessionId, number>`. `LiveCoopScreen` computes it and feeds the dumb `PlayerStrip`; `ResultatsScreen` computes it from a new `lockedPositions` prop and renders a score-ranked leaderboard. No backend, schema, or wire change.

**Tech Stack:** React 19 + TypeScript, Panda CSS, vitest + Testing Library, axe-core (a11y). Flat-key i18n in `frontend/src/ui/i18n/messages.fr.ts` with `{{param}}` interpolation and `_one`/`_other` plural suffixes selected on a numeric `count` param.

## Global Constraints

- **Frontend only.** No changes under `game/`, no schema/wire edits, no new dependency.
- **French copy, tutoiement** (`tu`, never `vous`). All user-facing strings via `t()`; no literals in components.
- **Comments:** one line max, non-obvious *why* only. No multi-line comment blocks in new code.
- **Score = `count(lockedPositions where lockedBy === sessionId)`** — validated letters, ADR-0086 word-completer attribution. `0` shown explicitly.
- **a11y (ADR-0050):** an `aria-label` on a non-interactive `<span>` needs `role="img"` to be valid (mirror the existing status-dot pattern in `PlayerStrip`). Keep axe clean.
- **Live roster stays join-order** (no re-sort). **Résultats sorts by score descending**, ties broken by join order (stable `Array.prototype.sort`).
- **DCO:** every commit signed off (`git commit -s`) and ends with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- **Branch:** `feat/coop-letter-score` (already checked out in this worktree, off fresh `origin/main`).
- Two PRs: **Wave 1** = ADR-0101 governance (Task 1). **Wave 2** = implementation (Tasks 2–6), merges after Wave 1.

---

### Task 1: ADR-0101 + INDEX entry (Wave 1 PR)

**Files:**
- Create: `docs/adr/0101-coop-validated-letter-score.md`
- Modify: `docs/adr/INDEX.md` (append to the registry table)

**Interfaces:**
- Consumes: nothing.
- Produces: the governance record Wave 2 links to; updates the stale ADR-0072 "no scores" note.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0101-coop-validated-letter-score.md`:

```markdown
# ADR-0101: Co-op validated-letter score (per-player contribution tally)

## Status

Accepted

## Context

In co-op (ADR-0018, ADR-0084), ADR-0086 already attributes every locked cell to
the player who completed its word (`lockedPositions[].lockedBy`, first-writer-
wins on crossings) and tints the board by that owner. The maintainer wants each
player's tag to also carry a **score**: how many validated letters they
contributed. ADR-0072's co-op finish screen carried an explicit "no scores —
versus mode is a deferred follow-up" note; this adds a *collaborative
contribution tally*, distinct from the still-deferred competitive/versus mode.

Because `lockedBy` is already on every lobby snapshot and every `wordLocked`
frame, the score is a pure client-side derivation — no new wire field.

## Decision

- **Score = number of `lockedPositions` whose `lockedBy` is the player's
  session.** Validated letters, not words. By construction it equals the count
  of that player's coloured cells on the board (ADR-0086), so score and grid
  never disagree.
- Rendered on the **live roster chips** (`PlayerStrip`, join-order, updates as
  words lock) and on the **Résultats finish screen** as a **leaderboard ranked
  by score descending** (ties broken by join order).
- **Frontend only.** A shared helper derives the tally from the existing
  `lockedPositions`. No backend, schema, or persistence change.
- Attribution is *not* per-letter authorship ("letters I personally typed");
  that would need new server-side per-cell author tracking and would make the
  score diverge from the board colours. Rejected.

This **amends ADR-0072's "no scores" note**: the collaborative contribution
tally is now shown; competitive/versus scoring remains deferred.

## Consequences

### Easier
- Players see who contributed what, consistent with the existing per-finder
  board colouring. Reconnects/late-joiners see correct scores (derived from the
  snapshot's `lockedPositions`).

### Harder
- Nothing structural — one helper plus two presentational surfaces.

### Different
- The Résultats participant card becomes a ranked contribution tally rather than
  an unordered "who was here" list.

## Relationships

- **Builds on ADR-0086** (per-cell `lockedBy` attribution) and **ADR-0018 /
  ADR-0084** (co-op locking). **Amends ADR-0072** (co-op finish "no scores").
  Reuses **ADR-0050** a11y posture.
```

- [ ] **Step 2: Add the INDEX entry**

In `docs/adr/INDEX.md`, append these rows to the registry table (matching the existing `ADR-NNNN  path  description` column style; use the same whitespace alignment as neighbouring rows):

```
ADR-0101  frontend/src/application/game/playerScores.ts   Co-op score = count of lockedPositions per lockedBy (ADR-0086 attribution); frontend-only derivation
ADR-0101  frontend/src/ui/v2/multiplayer/PlayerStrip.tsx   Live roster chip carries the player's validated-letter count (join-order, no re-sort)
ADR-0101  frontend/src/ui/v2/multiplayer/ResultatsScreen.tsx  Résultats ranks players by validated-letter score descending; amends ADR-0072 no-scores note
```

- [ ] **Step 3: Verify the registry-coherence pairing**

Run: `git status --porcelain docs/adr/`
Expected: both `0101-coop-validated-letter-score.md` (new) and `INDEX.md` (modified) appear — the `registry-coherence` CI gate requires an ADR change to touch `INDEX.md` in the same PR.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0101-coop-validated-letter-score.md docs/adr/INDEX.md
git commit -s -m "docs(adr): ADR-0101 co-op validated-letter score (amends 0072)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

This is the Wave 1 PR. Open it, let it merge on green CI + §6a LGTM, then start Task 2.

---

### Task 2: `tallyValidatedLetters` helper (Wave 2 PR starts here)

**Files:**
- Create: `frontend/src/application/game/playerScores.ts`
- Modify: `frontend/src/application/game/index.ts` (add one export)
- Test: `frontend/tests/player-scores.test.ts`

**Interfaces:**
- Consumes: `SessionId` from `@/domain/game`.
- Produces: `tallyValidatedLetters(lockedPositions: ReadonlyArray<{ readonly lockedBy: SessionId }>): ReadonlyMap<SessionId, number>` — importable from `@/application/game`. Tasks 5 and 6 use it.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/player-scores.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { tallyValidatedLetters } from '@/application/game';
import type { SessionId } from '@/domain/game';

const p1 = 'p1' as SessionId;
const p2 = 'p2' as SessionId;

describe('tallyValidatedLetters', () => {
  it('returns an empty map for no locked cells', () => {
    expect(tallyValidatedLetters([]).size).toBe(0);
  });

  it('counts every locked cell against its lockedBy owner', () => {
    const scores = tallyValidatedLetters([{ lockedBy: p1 }, { lockedBy: p1 }, { lockedBy: p1 }]);
    expect(scores.get(p1)).toBe(3);
  });

  it('splits counts across owners (POMME/PUIT crossing → P1=5, P2=3)', () => {
    const locked = [
      ...Array.from({ length: 5 }, () => ({ lockedBy: p1 })),
      ...Array.from({ length: 3 }, () => ({ lockedBy: p2 })),
    ];
    const scores = tallyValidatedLetters(locked);
    expect(scores.get(p1)).toBe(5);
    expect(scores.get(p2)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test player-scores`
Expected: FAIL — `tallyValidatedLetters` is not exported from `@/application/game`.

- [ ] **Step 3: Write the helper**

Create `frontend/src/application/game/playerScores.ts`:

```ts
import type { SessionId } from '@/domain/game';

// Per-player validated-letter tally: count each locked cell against its ADR-0086 `lockedBy` owner (equals the player's coloured cells on the board).
export function tallyValidatedLetters(
  lockedPositions: ReadonlyArray<{ readonly lockedBy: SessionId }>,
): ReadonlyMap<SessionId, number> {
  const scores = new Map<SessionId, number>();
  for (const cell of lockedPositions) {
    scores.set(cell.lockedBy, (scores.get(cell.lockedBy) ?? 0) + 1);
  }
  return scores;
}
```

- [ ] **Step 4: Export it from the barrel**

In `frontend/src/application/game/index.ts`, add after the existing `export { ... } from './LobbyClient';` block:

```ts
export { tallyValidatedLetters } from './playerScores';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && pnpm test player-scores`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/application/game/playerScores.ts frontend/src/application/game/index.ts frontend/tests/player-scores.test.ts
git commit -s -m "feat(frontend-application): tallyValidatedLetters per-player score helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: i18n keys

**Files:**
- Modify: `frontend/src/ui/i18n/messages.fr.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: message keys `v2.multiplayer.presence.aria.score` (params `name`, `count`) and `v2.multiplayer.resultats.letterCount` (param `count`) — both plural-aware. Tasks 4 and 6 call them via `t()`.

- [ ] **Step 1: Add the roster-chip aria keys**

In `frontend/src/ui/i18n/messages.fr.ts`, after the line `'v2.multiplayer.presence.aria.status': '{{name}} : {{status}}',` add:

```ts
  'v2.multiplayer.presence.aria.score_one': '{{name}} : {{count}} lettre validée',
  'v2.multiplayer.presence.aria.score_other': '{{name}} : {{count}} lettres validées',
```

- [ ] **Step 2: Add the Résultats row-value keys**

In the same file, after the line `'v2.multiplayer.resultats.withCount': 'Avec ({{total}})',` add:

```ts
  'v2.multiplayer.resultats.letterCount_one': '{{count}} lettre',
  'v2.multiplayer.resultats.letterCount_other': '{{count}} lettres',
```

(French plural: `Intl.PluralRules('fr')` selects `one` for 0 and 1, `other` otherwise — so `0 lettre`, `1 lettre validée`, `2 lettres validées` all read correctly.)

- [ ] **Step 3: Verify typecheck accepts the new keys**

Run: `cd frontend && pnpm typecheck`
Expected: PASS — `MessageKey` is derived from `typeof fr`, so the new `_one`/`_other` pairs become the callable keys `...aria.score` and `...resultats.letterCount`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/ui/i18n/messages.fr.ts
git commit -s -m "feat(frontend-ui): i18n keys for co-op validated-letter score

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Score on the roster chip (`PlayerStrip`)

**Files:**
- Modify: `frontend/src/ui/v2/multiplayer/PlayerStrip.tsx`
- Test: `frontend/tests/player-strip.test.tsx` (new)

**Interfaces:**
- Consumes: `t('v2.multiplayer.presence.aria.score', { name, count })` (Task 3).
- Produces: `PlayerStrip` gains optional prop `scoresBySessionId?: ReadonlyMap<SessionId, number>`. Task 5 supplies it.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/player-strip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Instant, Player, Pseudonym, SessionId } from '@/domain/game';
import { PlayerStrip } from '@/ui/v2/multiplayer/PlayerStrip';

const a = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const b = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c' as SessionId;
const players: ReadonlyArray<Player> = [
  { sessionId: a, pseudonym: 'Alex' as Pseudonym, joinedAt: '2026-06-27T15:30:00Z' as Instant },
  { sessionId: b, pseudonym: 'Sam' as Pseudonym, joinedAt: '2026-06-27T15:31:00Z' as Instant },
];
const empty = new Set<SessionId>();

function renderStrip(scores?: ReadonlyMap<SessionId, number>) {
  return render(
    <PlayerStrip
      players={players}
      currentSessionId={a}
      typingSessionIds={empty}
      idleSessionIds={empty}
      disconnectingSessionIds={empty}
      scoresBySessionId={scores}
    />,
  );
}

describe('PlayerStrip score', () => {
  it('renders each player validated-letter count', () => {
    renderStrip(new Map([[a, 12], [b, 5]]));
    expect(screen.getByLabelText('Alex : 12 lettres validées')).toBeTruthy();
    expect(screen.getByLabelText('Sam : 5 lettres validées')).toBeTruthy();
  });

  it('shows 0 for a player absent from the score map', () => {
    renderStrip(new Map([[a, 3]]));
    expect(screen.getByLabelText('Sam : 0 lettre validée')).toBeTruthy();
  });

  it('defaults every score to 0 when no map is provided', () => {
    renderStrip(undefined);
    expect(screen.getByLabelText('Alex : 0 lettre validée')).toBeTruthy();
  });

  it('does not reorder chips by score', () => {
    renderStrip(new Map([[a, 1], [b, 99]]));
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('Alex');
    expect(items[1].textContent).toContain('Sam');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test player-strip`
Expected: FAIL — `scoresBySessionId` is not a prop; no score element is rendered.

- [ ] **Step 3: Add the count style**

In `frontend/src/ui/v2/multiplayer/PlayerStrip.tsx`, after the `const dotLost = ...` line add a count style:

```ts
const count = css({
  flex: 'none',
  fontFamily: 'wsMono',
  fontSize: '11.5px',
  fontWeight: 'black',
  fontVariantNumeric: 'tabular-nums',
  color: 'ws.jadeInk',
  opacity: 0.75,
  minWidth: '12px',
  textAlign: 'center',
});
```

- [ ] **Step 4: Add the prop**

Extend `PlayerStripProps`:

```ts
export interface PlayerStripProps {
  readonly players: ReadonlyArray<Player>;
  readonly currentSessionId: SessionId;
  readonly typingSessionIds: ReadonlySet<SessionId>;
  readonly idleSessionIds: ReadonlySet<SessionId>;
  readonly disconnectingSessionIds: ReadonlySet<SessionId>;
  readonly scoresBySessionId?: ReadonlyMap<SessionId, number>;
}
```

And add `scoresBySessionId` to the destructured params of `PlayerStrip({ ... })`.

- [ ] **Step 5: Render the count**

Inside the `players.map((p) => { ... })` body, after the `const status = ...` assignment add:

```tsx
        const score = scoresBySessionId?.get(p.sessionId) ?? 0;
```

Then in the returned `<li>`, insert the count span between the `name` span and the status `dot` span:

```tsx
            <span
              className={count}
              role="img"
              aria-label={t('v2.multiplayer.presence.aria.score', { name: p.pseudonym, count: score })}
            >
              <span aria-hidden="true">{score}</span>
            </span>
```

(`role="img"` makes the `aria-label` authoritative; the inner `aria-hidden` digit prevents a screen reader double-read — mirrors the existing status-dot pattern.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && pnpm test player-strip`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/ui/v2/multiplayer/PlayerStrip.tsx frontend/tests/player-strip.test.tsx
git commit -s -m "feat(frontend-ui): validated-letter score on co-op roster chips

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire the score into `LiveCoopScreen`

**Files:**
- Modify: `frontend/src/ui/v2/multiplayer/LiveCoopScreen.tsx`

**Interfaces:**
- Consumes: `tallyValidatedLetters` (Task 2); `PlayerStrip`'s `scoresBySessionId` prop (Task 4). `LiveCoopScreen` already receives `lockedPositions: ReadonlyArray<{ row; column; lockedBy: SessionId }>` and already builds `lockedByAt`.
- Produces: both `PlayerStrip` render sites (desktop + mobile) receive the live score map.

- [ ] **Step 1: Import the helper**

At the top of `frontend/src/ui/v2/multiplayer/LiveCoopScreen.tsx`, add to the existing `@/application/game` import (or add a new import line if none exists):

```ts
import { tallyValidatedLetters } from '@/application/game';
```

- [ ] **Step 2: Compute the score map**

Immediately after the existing `const lockedByAt = useMemo(...)` block, add:

```ts
  const scoresBySessionId = useMemo(() => tallyValidatedLetters(lockedPositions), [lockedPositions]);
```

- [ ] **Step 3: Pass it to both PlayerStrip sites**

Add `scoresBySessionId={scoresBySessionId}` as a prop to **both** `<PlayerStrip ... />` elements (the desktop one inside `coopPresence`, and the mobile one inside `header`). Example, for each:

```tsx
              <PlayerStrip
                players={players}
                currentSessionId={sessionId}
                typingSessionIds={typingSessionIds}
                idleSessionIds={idleSessionIds}
                disconnectingSessionIds={disconnectingSessionIds}
                scoresBySessionId={scoresBySessionId}
              />
```

- [ ] **Step 4: Verify typecheck and the existing suite**

Run: `cd frontend && pnpm typecheck && pnpm test player-strip player-scores`
Expected: PASS. (`LiveCoopScreen` has no dedicated unit test; typecheck + the PlayerStrip test cover the wiring.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/v2/multiplayer/LiveCoopScreen.tsx
git commit -s -m "feat(frontend-ui): wire per-player score into LiveCoopScreen roster

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Rank Résultats by score

**Files:**
- Modify: `frontend/src/ui/v2/multiplayer/ResultatsScreen.tsx`
- Modify: `frontend/src/ui/routes/lobby.$lobbyId.tsx` (COMPLETED branch call site)
- Test: `frontend/tests/v2-resultats.test.tsx` (extend)

**Interfaces:**
- Consumes: `tallyValidatedLetters` (Task 2); `t('v2.multiplayer.resultats.letterCount', { count })` (Task 3); `LockedCell` from `@/domain/game`.
- Produces: `ResultatsScreen` gains required prop `lockedPositions: ReadonlyArray<LockedCell>`; renders a per-row count and orders rows by score descending.

- [ ] **Step 1: Write the failing tests**

In `frontend/tests/v2-resultats.test.tsx`, first add `lockedPositions: []` to the default `props` object inside `renderResultats` (so existing tests still construct valid props):

```ts
  const props: ResultatsScreenProps = {
    durationMs: 7 * 60 * 1000 + 24 * 1000,
    players,
    ownerSessionId: ownerId,
    lockedPositions: [],
    isReplaying: false,
    onReplay: vi.fn(),
    onHome: vi.fn(),
    ...overrides,
  };
```

Then add these tests inside the `describe('v2 ResultatsScreen', ...)` block:

```ts
  it('shows each contributor validated-letter count', () => {
    renderResultats({
      lockedPositions: [
        { row: 0, column: 0, lockedBy: ownerId },
        { row: 0, column: 1, lockedBy: ownerId },
        { row: 1, column: 0, lockedBy: guestId },
      ],
    });
    expect(screen.getByText('2 lettres')).toBeTruthy();
    expect(screen.getByText('1 lettre')).toBeTruthy();
  });

  it('ranks players by validated-letter score descending', () => {
    renderResultats({
      lockedPositions: [
        { row: 0, column: 0, lockedBy: guestId },
        { row: 0, column: 1, lockedBy: guestId },
        { row: 1, column: 0, lockedBy: ownerId },
      ],
    });
    const names = screen.getAllByText(/^(Léa|Amie)$/).map((n) => n.textContent);
    expect(names).toEqual(['Amie', 'Léa']); // guest 2 > owner 1
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm test v2-resultats`
Expected: FAIL — `lockedPositions` is not a prop; no count text; rows not ranked.

- [ ] **Step 3: Add the prop, helper import, and LockedCell type**

In `frontend/src/ui/v2/multiplayer/ResultatsScreen.tsx`, update the imports:

```ts
import type { LockedCell, Player, SessionId } from '@/domain/game';
import { tallyValidatedLetters } from '@/application/game';
```

Extend `ResultatsScreenProps` with:

```ts
  readonly lockedPositions: ReadonlyArray<LockedCell>;
```

and add `lockedPositions` to the destructured params of `ResultatsScreen({ ... })`.

- [ ] **Step 4: Update the stale ADR comment**

Replace the top comment line `// ADR-0072 co-op finish: no scores — versus mode is a deferred follow-up.` with:

```ts
// Co-op finish: per-player validated-letter tally ranked as a leaderboard (ADR-0101, amends ADR-0072). Competitive/versus mode still deferred.
```

- [ ] **Step 5: Add the count style and right-group style**

After the existing `const badge = css({ ... });` block add:

```ts
const rightGroup = css({
  flex: 'none',
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
});
const letterCount = css({
  fontFamily: 'wsMono',
  fontSize: '13px',
  fontWeight: 'black',
  fontVariantNumeric: 'tabular-nums',
  color: 'ws.jadeInk',
});
```

Then remove `marginLeft: 'auto',` from the existing `badge` style (the `rightGroup` now owns the right alignment).

- [ ] **Step 6: Compute scores, rank, and render the row value**

Inside `ResultatsScreen`, before the `return (`, add:

```ts
  const scores = tallyValidatedLetters(lockedPositions);
  const ranked = [...players].sort(
    (x, y) => (scores.get(y.sessionId) ?? 0) - (scores.get(x.sessionId) ?? 0),
  );
```

Change the participant `<ul>` to map over `ranked` instead of `players`, and replace each `<li>` body's trailing host-badge expression with a right-group holding the badge and the count:

```tsx
        <ul className={list}>
          {ranked.map((p) => (
            <li key={p.sessionId} className={playerRow}>
              <PlayerAvatar sessionId={p.sessionId} pseudonym={p.pseudonym} size={34} />
              <span className={playerName}>{p.pseudonym}</span>
              <span className={rightGroup}>
                {p.sessionId === ownerSessionId ? <span className={badge}>{t('v2.multiplayer.host.badge')}</span> : null}
                <span className={letterCount}>
                  {t('v2.multiplayer.resultats.letterCount', { count: scores.get(p.sessionId) ?? 0 })}
                </span>
              </span>
            </li>
          ))}
        </ul>
```

(The `withCount` header still uses `players.length` — unchanged.)

- [ ] **Step 7: Wire the route call site**

In `frontend/src/ui/routes/lobby.$lobbyId.tsx`, in the `COMPLETED` branch's `<ResultatsScreen ... />`, add the prop:

```tsx
          lockedPositions={lobby.game?.lockedPositions ?? []}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && pnpm test v2-resultats`
Expected: PASS — including the existing owner-badge and a11y tests (the count is plain list text; axe stays clean).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/ui/v2/multiplayer/ResultatsScreen.tsx frontend/src/ui/routes/lobby.\$lobbyId.tsx frontend/tests/v2-resultats.test.tsx
git commit -s -m "feat(frontend-ui): rank Résultats by validated-letter score

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full verification + open the Wave 2 PR

**Files:** none (verification + PR).

- [ ] **Step 1: Run the full frontend gate**

Run: `cd frontend && pnpm typecheck && pnpm test && pnpm a11y`
Expected: all PASS. (No schema edits, so `pnpm api:check` is not needed.)

- [ ] **Step 2: Confirm no out-of-scope files changed**

Run: `git diff --name-only origin/main...HEAD`
Expected: only the ADR files (Wave 1, already merged) and the frontend files listed in Tasks 2–6 — nothing under `game/`, no generated types, no schema.

- [ ] **Step 3: Push and open the PR**

Push `feat/coop-letter-score` and open a PR whose body names the workstream (co-op validated-letter score), the bounded context/layer (frontend — application + ui), links ADR-0101 and the spec, and states no schema shipped. Then schedule the auto-merge cron (merge on green CI + §6a LGTM).

---

## Self-Review

**Spec coverage:** semantics → ADR-0101 (T1) + helper (T2); live roster chip → T4 + T5; Résultats leaderboard → T6; ADR + INDEX → T1; i18n → T3; testing → tests in T2/T4/T6 + T7 gate; scope/two-waves → T1 (Wave 1) vs T2–T6 (Wave 2). No gaps.

**Placeholder scan:** every code step shows complete code; no TBD/TODO/"handle edge cases". Clear.

**Type consistency:** `tallyValidatedLetters(ReadonlyArray<{ readonly lockedBy: SessionId }>) → ReadonlyMap<SessionId, number>` used identically in T2 (def), T5, T6. `scoresBySessionId?: ReadonlyMap<SessionId, number>` matches between T4 (PlayerStrip prop) and T5 (LiveCoopScreen supply). `lockedPositions: ReadonlyArray<LockedCell>` in T6 matches `lobby.game?.lockedPositions` (`readonly LockedCell[]`). Message keys `v2.multiplayer.presence.aria.score` / `v2.multiplayer.resultats.letterCount` defined in T3, consumed in T4/T6. Consistent.
