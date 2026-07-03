# /grilles rework — calendar view + kind-based tabs

Date: 2026-07-03
Status: Approved (maintainer, 2026-07-03)
Bounded context: `frontend/` (ui layer only — no API or schema change)
Governing ADRs: ADR-0002 (stack), ADR-0050 (a11y), ADR-0054 (shell), ADR-0072/0074 (v2 design), ADR-0080 (archive paywall)

## Context

`/grilles` today is `GrillesArchiveScreen`: a `SegmentedControl` with three
**status** tabs (À jouer / À finir / Terminées) filtering a month-grouped card
list of daily grids, a "Parties à plusieurs" section rendered above the list
only when the player has lobbies, an `ArchiveUpsellBanner` for subscribable
users, the >7-days paywall lock (ADR-0080), and a load-more button that widens
the query window.

Problems: status tabs fragment one archive into three lists; the multiplayer
section is invisible to players without lobbies; a long card list is a poor
overview of "which days have I played".

## Decision

Replace the status tabs with **kind/actionability tabs**, and make a month
calendar the daily view. Statuses that were tabs become per-cell visual states.

### 1. Screen structure

`GrillesArchiveScreen` keeps `PhoneShell`, `MobileTopBar`, `BottomNav`, the
"Grilles" title, `MenuSheet` and `AbonnementSheet`. The `SegmentedControl`
switches **views**: `Quotidiennes` / `À finir` / `À plusieurs`.

- Active tab reflected in an optional search param: `/grilles?onglet=a-finir`
  or `?onglet=plusieurs`; default (absent) = Quotidiennes. Back button and
  deep links work.
- Multiplayer flag off (`lobbyClient`/`getSession` absent from route context,
  ADR-0018 §10): the À plusieurs tab is omitted; the control shows 2 options.

### 2. Quotidiennes tab — the calendar

New component `frontend/src/ui/v2/DailyCalendar.tsx` (custom month grid; Ark
UI's date picker does not fit a status calendar). Header `◀ Juin 2026 ▶`:
◀ disabled before the earliest archive month, ▶ disabled at the current month.

Cell states (never encoded by color alone — shape/fill differ):

| State | Visual | Tap |
|---|---|---|
| Terminée | filled jade | `/play?date=…` (revoir) |
| En cours | half-filled / sakura ring | `/play?date=…` |
| À jouer | outlined neutral | `/play?date=…` |
| Paywalled | muted/desaturated, **no per-cell padlock** | opens `AbonnementSheet` (context `grid`) |
| Aujourd'hui | highlighted ring + sakura treatment | `/play` (no param) |
| Future / pre-launch | blank | non-interactive |

A one-line legend below the grid explains the states, including that older
grids are "réservées à l'abonnement" (calm, no pressure — ethical-UX rule).
`ArchiveUpsellBanner` stays for `canSubscribe` users, below the calendar.

Paywall rule unchanged from today (ADR-0080 W5a cosmetic lock): unstarted,
older than 7 days, `canSubscribe`.

### 3. À finir tab

The existing card style (date · n°grille, "En cours · 31/58 cases", progress
bar, chevron) listing **all** in-progress grids across the whole archive,
newest first. This is where progress detail lives now that calendar cells
cannot carry it. Started grids are never paywalled, so no lock rows. Empty
state: existing `GrillesEmptyState` 'progress' copy.

### 4. À plusieurs tab

`GrillesLobbiesSection`'s card list becomes the tab body (no heading dup —
the tab is the heading). New empty state (SparrowState pattern): "Aucune
partie à plusieurs" with a **Créer une partie** CTA reusing the HomeScreen
`createLobby` → navigate-to-`/lobby/$lobbyId` flow, including the ADR-0083
expired-session sign-in safety net. Joining by code stays on Home in v1; the
empty state links there rather than duplicating the input.

### 5. Data & state

One effect fetches the full archive: `listDailySummaries` looping while
`hasMore`, re-issuing with `to` set to one day before the oldest received
item, back to the server's launch anchor. Bounded: 100 items/page, archive is
months old; revisit if the loop ever exceeds a few pages. The single dataset
derives:

- calendar cell states for any month (no per-month queries);
- the earliest archive month (◀ clamp);
- the À finir list.

Status derivation unchanged: `soloEntriesStore.loadLockedCells` /
`.load` per summary id + `useCanSubscribe`. Lobbies fetch unchanged
(`listMyLobbies` on mount when adapters present). Skeleton keeps the 200 ms
gate; the Quotidiennes skeleton is grid-shaped.

### 6. Accessibility (ADR-0050)

- Every cell is a real `Link`/`button` with an aria-label like
  "Mercredi 4 juin — en cours" / "Grille réservée à l'abonnement —
  Mercredi 4 juin"; French, matching current row labels.
- Cells in normal DOM order; no roving-focus grid widget in v1 (deferred —
  documented here so it isn't re-litigated per PR).
- Focus visible (`ws.sakuraRose` outline, as today), AA contrast on all cell
  states (khaki opacity ≥ 0.85 rule; `ws.sakuraDark` over sakura for text on
  fills).
- axe (vitest-axe) on the new calendar component; zero serious/critical.

### 7. Testing

Vitest: status derivation (done/progress/new/paywalled/future/pre-launch
around UTC-midnight boundaries), month navigation clamps (earliest month,
current month), tab switching + `onglet` param round-trip, paywalled tap →
sheet, empty states per tab, aria-labels, fetch-all paging loop (multi-page
`hasMore` sequence via fake repository). Rework existing
`GrillesArchiveScreen` tests rather than deleting. Screenshot pass against
the serene-naturalist v2 direction before declaring done (mockup-verify
rule); `pnpm a11y` unchanged routes still green.

## Delivery

Frontend-only workstream. **Gate: the full rework is demoed locally
(running app, maintainer eyeballs it) before any PR opens.** Then two PRs to
respect the 400-line cap:

1. `feat(frontend-grid): daily calendar component` — `DailyCalendar.tsx` +
   status-derivation helpers + tests (component not yet routed).
2. `feat(frontend-grid): /grilles kind tabs over calendar` — screen rework:
   tabs + URL param, fetch-all loop, À finir body, À plusieurs body + empty
   state, reworked screen tests.

If PR 2 exceeds the cap after generated/blank exclusions, invoke the standing
cap-override with justification rather than splitting the screen mid-seam.

## Out of scope

- Server-side paywall enforcement (ADR-0080 W5b) — unchanged.
- Roving-focus/arrow-key calendar navigation (WAI-APG grid pattern).
- Join-by-code input on the À plusieurs empty state.
- Any grid/game API change.
- Multiplayer games inside À finir (lobbies keep their own states in their
  tab).
