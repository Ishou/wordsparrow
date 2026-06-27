# v2 Multiplayer — co-op reskin (design)

Date: 2026-06-27 · Status: approved (brainstorm), pending spec review → plan.

## Context

Prod multiplayer already exists and works (ADR-0018, implemented 2026-05-02):
create a lobby → shareable code → up to 8 players join → owner picks grid size →
everyone types into **one shared co-op grid** in real time, with a timer; ends when
the grid is solved. It ships dark behind the `multiplayer` feature flag (ADR-0018 §10).

The v2 redesign (ADR-0072) has reskinned home / grilles / play / réglages / legals.
This workstream brings the **multiplayer screens into the v2 look**, reusing the
working backend and client logic. The v2 mockup is `mockups/multiplayer-v2.html`
(3 screens: Salon, En direct, Résultats).

## Scope (decided)

- **Co-op reskin only, now.** Frontend-only: redesign lobby / join / live shared-grid /
  results in the v2 look, reusing the existing `GameClient` + `LobbyClient` + WebSocket.
  No backend changes.
- **Versus + per-player scoring + rematch are explicitly OUT** — a later, separate effort
  (new game domain logic + AsyncAPI events + its own ADR). The v2 mockup shows a coop/versus
  toggle and a winner/scores results screen; those are deferred. v2 Résultats is the co-op
  finish (solved, time, contributors), not a scoreboard.

## Decisions

1. **Reuse strategy = extract a shared hook + clean smart/dumb split (approach A).** The lobby
   orchestration (the `GameClient` subscribe handler → `LobbyView` reduction → connection state,
   plus the actions rename / setGridConfig / start / rotateCode / leave / cellUpdate / cellFocus)
   is currently **fused into the 1211-line prod route** `routes/lobby.$lobbyId.lazy.tsx`. Extract
   it into a reusable hook (working name **`useLobbyConnection`**). The prod route is refactored
   to consume it (**no behaviour change**); the v2 route consumes the same hook. Rejected
   alternatives: (B) duplicate the orchestration in the v2 route → guaranteed drift; (C)
   render-props on the prod component → couples prod to v2.
   - **Maintainer-authorised (2026-06-27): do the clean refactor if W1 calls for it.** Isolate the
     **WS mechanism** (connection/reconnect/event-decode) from the **lobby state reduction**, and
     split **smart containers** (own `useLobbyConnection` state + actions) from **dumb presentational
     components** (pure props + callbacks, no client/WS access). Prod and v2 each render their own
     dumb views over the one shared brain. Aim: each unit has one purpose, a clear interface, and is
     testable in isolation — not a 1211-line route. Keep the refactor behaviour-preserving (tests green).
2. **Live grid = v2 PlayGrid + a presence layer.** Reuse the design-system `PlayGrid`/`Cell`
   from `/v2/play`; add a presence layer (other players' focused cells in their colours) restyled
   from the existing `usePresenceState` / `PresenceOverlay`. One grid component, solo↔co-op
   consistent.
3. **Entry = a "Jouer à plusieurs" button on `/v2/home`** (under the daily card), shown only
   when the `multiplayer` flag is on. Join via shared link `/v2/join/<code>`.
4. **Backend untouched.** game-api, WebSocket, lobby/game state stay as-is.

## Architecture / reuse map

- **Reuse as-is:** `application/game/{GameClient,LobbyClient}`, the domain `Lobby` /
  `LobbyLifecycleState` / `Pseudonym` / `GridConfig` types, `usePresenceState`, the WS infra
  (`WebSocketGameClient`, reconnect), the `multiplayer` flag + `gameBaseUrl` wiring in `main.tsx`.
- **Extract (W1):** `useLobbyConnection` — owns the subscription, the `LobbyView` state, connection
  state, pseudonym/join/start/rotate sub-states, and the action callbacks. Prod route + v2 route
  both consume it. Existing tests are the safety net: `lobby-route.test.tsx`,
  `websocket-game-client`, `reconnecting-game-client`, `lobby-ws-handler`, `lobby-multi-announce`,
  `grid-presence`, `presence-overlay`, `end-game-modal`. Add characterization tests for the hook if
  the extraction moves assertions.
- **New (W2–W4):** v2 routes (`routes/v2.lobby.$lobbyId.tsx`, `routes/v2.join.$code.tsx`) and v2 ui
  components under `ui/v2/multiplayer/` (Salon, the live presence layer + timer + player strip,
  Résultats), all consuming `useLobbyConnection` + the v2 `PlayGrid`.

## Screens (from the mockup, co-op)

1. **Salon** — `/v2/lobby/$lobbyId`, WAITING. Shareable code + copy action, player list with
   presence (avatars/pseudos, owner badge), owner controls (grid-size picker, Start), rename self,
   leave. (No coop/versus toggle now.)
2. **En direct** — same route, IN_PROGRESS. The shared v2 grid + clue rail, other players' focused
   cells in their colours, a live timer, a compact player/presence strip. Everyone types into the
   same grid (cellUpdate / cellFocus over WS).
3. **Résultats** — COMPLETED. Co-op finish: "Résolue !", final time, the players who took part,
   "Rejouer" (new lobby) + back to home. No winner / scores (versus follow-up).

## Routes & gating

- `/v2/lobby/$lobbyId` + `/v2/join/$code` registered under the DEV-gated `/v2` parent **and** only
  when the `multiplayer` flag is on — i.e. `import.meta.env.DEV && multiplayer` (mirrors prod
  shipping dark). `/v2/join/$code` resolves the code via `LobbyClient.findByCode` → joins →
  redirects to `/v2/lobby/$id` (mirrors the prod `join.$code` flow).

## Accessibility (ADR-0050)

- Hold WCAG AA throughout (the rest of v2 is at A11y 100).
- The live grid must announce co-op events via an `aria-live` Announcer (other players joining /
  leaving, the grid being solved) — this also advances the `/v2/play` Announcer gap flagged in the
  reconciliation audit. Reuse the prod `useAnnouncer` / `lobby-multi-announce` patterns.

## Testing

- W1: keep the full multiplayer suite green; add `useLobbyConnection` unit/characterization tests.
- W2–W4: vitest + `expectAxeClean` per new v2 component; render-verify each screen vs the mockup at
  phone width; manual two-client smoke via `pnpm dev:preview` where feasible.

## PR waves

- **W1 — `refactor`: extract `useLobbyConnection` from the prod lobby route.** Prod consumes it;
  behaviour unchanged; suite green. Bundles this spec doc. *(Riskiest — 1211-line WS file; the
  existing tests guard it.)*
- **W2 — `feat`: `/v2/lobby/$id` route + v2 Salon (waiting room).**
- **W3 — `feat`: the IN_PROGRESS view** — v2 PlayGrid + presence layer + timer + player strip.
- **W4 — `feat`: Résultats + `/v2/join/$code` + the `/v2/home` "Jouer à plusieurs" entry.**

Each wave: own PR, reviewed + merged before the next starts; render-verified vs the mockup; AA held;
multiplayer suite green.

## Risks

- **W1 extraction** of a 1211-line WS-heavy route is the main risk. Mitigation: the existing
  multiplayer test suite (above) is the safety net; do a pure extract (move, don't rewrite); if
  coverage gaps appear around the moved logic, add characterization tests *first*.
- Two-client real-time behaviour is hard to assert in unit tests; rely on the WS-handler tests +
  manual smoke.

## Out of scope

Versus mode, per-player scoring, winner, rematch-as-versus; any backend/AsyncAPI change; touching
prod `/grille` or `/lobby` *behaviour* (W1 is a behaviour-preserving refactor only).
