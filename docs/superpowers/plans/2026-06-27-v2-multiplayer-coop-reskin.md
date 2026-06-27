# v2 Multiplayer (co-op reskin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the existing co-op multiplayer (lobby → shared real-time grid → results) into the v2 design, reusing the working backend + WebSocket logic — no backend changes.

**Architecture:** Extract the lobby WebSocket orchestration out of the 1211-line prod route into a reusable **`useLobbyConnection`** hook (clean WS-mechanism ⁄ state-reduction separation, smart containers vs dumb presentational components). The prod route and the new v2 routes both consume that one hook; v2 renders its own dumb components + the v2 `PlayGrid` with a presence layer.

**Tech Stack:** Vite + React 19 + TanStack Router + Panda CSS + Ark UI + Vitest + `@axe-core/playwright`; WebSocket `GameClient` / REST `LobbyClient` (game bounded context, ADR-0018).

**Spec:** `docs/superpowers/specs/2026-06-27-v2-multiplayer-coop-reskin-design.md` (bundle into the W1 PR).

## Global Constraints

- French copy uses **tutoiement** (tu), never vous.
- v2 tokens only (ADR-0072): jade / sakura / khaki; `wsDisplay`/`wsUi` fonts. **AA contrast is mandatory** (ADR-0050) — primary buttons use `ws.sakuraDark` (white-on-`ws.sakura` fails AA); muted text ≥ 0.85 opacity. (`fontWeight: 'black'` is the heaviest valid Panda token — `extrabold` is invalid → renders 400.)
- v2 routes are **DEV-gated** *and* multiplayer is **flag-gated** → register only when `import.meta.env.DEV && multiplayer`.
- Comments: one line, non-obvious *why* only (the §6a reviewer flags multi-line `//` blocks).
- Conventional commits, single bounded-context scope, DCO `-s`. Branch `<type>/<slug>`. 400-line soft cap per PR.
- **Behaviour-preserving in W1:** the prod multiplayer suite stays green throughout — `lobby-route`, `websocket-game-client`, `reconnecting-game-client`, `lobby-ws-handler`, `lobby-multi-announce`, `grid-presence`, `presence-overlay`, `end-game-modal`, `http-lobby-client`.
- One PR per wave; **each wave reviewed + merged before the next starts** (later waves may be reshaped by what W1 reveals).

---

## File structure

**W1 — extraction (new + modified):**
- Create `frontend/src/ui/components/lobby/useLobbyConnection.ts` — the smart hook: owns the `GameClient` subscription, the `LobbyView` reduction, connection state, the sub-states (pseudonym/join/start/rotate), and the action callbacks. Pure logic, no JSX.
- Create `frontend/src/ui/components/lobby/lobbyView.ts` (if the reducer/`LobbyView` type isn't already standalone) — the event→state reduction, unit-testable without React.
- Modify `frontend/src/ui/routes/lobby.$lobbyId.lazy.tsx` — becomes a thin **smart container** that calls `useLobbyConnection` and renders the existing dumb components (`WaitingRoom`, `Grid`, `EndGameModal`, `ConnectionBanner`). Target: well under its current 1211 lines.
- Create `frontend/tests/use-lobby-connection.test.tsx` + `frontend/tests/lobby-view.test.ts` — characterization tests for the moved logic.

**W2–W4 — v2 screens (created once W1's hook interface is final):**
- `frontend/src/ui/routes/v2.lobby.$lobbyId.tsx`, `frontend/src/ui/routes/v2.join.$code.tsx` (+ register in `router.ts` under `DEV && multiplayer`).
- `frontend/src/ui/v2/multiplayer/` — `SalonScreen.tsx` (W2), `LiveCoopScreen.tsx` + `CoopPresenceLayer.tsx` + `PlayerStrip.tsx` + `LiveTimer.tsx` (W3), `ResultatsScreen.tsx` (W4).
- Modify `frontend/src/ui/home/HomeScreen.tsx` — flag-gated "Jouer à plusieurs" entry (W4).

---

## Wave 1 — Extract `useLobbyConnection` (refactor, behaviour-preserving)

**Deliverable:** the prod lobby route is a thin smart container over a reusable `useLobbyConnection` hook; the full multiplayer suite is green; no behaviour change. Bundles the spec doc. *(This is the foundation every later wave consumes.)*

**Interface — produced (load-bearing; later waves consume this verbatim):**
```ts
// frontend/src/ui/components/lobby/useLobbyConnection.ts
export interface LobbyConnection {
  readonly view: LobbyView;                 // { lobby, lifecycle, players, presence, code, ... } — the existing route-local snapshot
  readonly connectionState: ConnectionState;
  readonly pseudonymError: string | null;
  readonly joinDenied: string | null;
  readonly joinConfirmed: boolean;
  readonly isStarting: boolean;
  readonly isRotating: boolean;
  readonly actions: {
    readonly rename: (p: Pseudonym) => void;
    readonly setGridConfig: (c: GridConfig) => void;
    readonly start: () => void;
    readonly rotateCode: () => void;
    readonly leave: () => void;
    readonly cellUpdate: (row: number, column: number, letter: Letter | null) => void;
    readonly cellFocus: (row: number, column: number, /* …existing focus args… */) => void;
    readonly clearPseudonymError: () => void;
  };
}
export function useLobbyConnection(args: {
  readonly lobbyId: LobbyId;
  readonly initialLobby: Lobby;
  readonly gameClient: GameClient;
  // …the persisted-pseudonym + navigate/toast/announce seams the route currently owns…
}): LobbyConnection;
```
> The exact `LobbyView` shape, the `cellFocus` args, and the auxiliary seams (toast, announcer, persisted pseudonym, navigate-on-leave) are **read from the current route during implementation** and preserved verbatim — this block is the target, finalized in Task 1.

**Approach:** pure **extract-and-move**, not rewrite. Read `routes/lobby.$lobbyId.lazy.tsx` end-to-end; lift the `useState`/`useRef`/`useEffect`(subscribe)/reducer/action-callbacks into the hook unchanged; the route keeps only `useLoaderData`/`useParams`/`useRouteContext` + the render tree, now driven by the hook's return. If the event→state reduction is inline, split it into `lobbyView.ts` as a pure function first (own test), then the hook calls it. Smart/dumb: the route + hook are "smart"; `WaitingRoom`/`Grid`/`EndGameModal` stay dumb (already props-driven).

- [ ] **Task 1 — Characterize before moving.** Read the whole prod route; write down the exact `LobbyView` type, every state/ref, the subscribe handler's event branches, and each action. Finalize the interface block above against reality. Confirm the existing suite passes as the baseline: `cd frontend && pnpm test --run tests/lobby-route.test.tsx tests/lobby-ws-handler.test.ts tests/lobby-multi-announce.test.tsx tests/grid-presence.test.tsx` → all PASS. Commit nothing (read-only baseline).
- [ ] **Task 2 — Pure reducer (if inline).** If the event→state reduction lives inside the subscribe handler, extract it to `lobbyView.ts` as `reduceLobby(view, event) => view`. TDD: write `tests/lobby-view.test.ts` asserting a representative event sequence (player joins → grid config set → start → cell update → solved) folds to the expected `LobbyView`; run red; implement by lifting the existing logic; run green; commit.
- [ ] **Task 3 — The hook.** Create `useLobbyConnection.ts`; move the state/refs/subscribe-effect/actions out of the route into it, returning `LobbyConnection`. No logic changes. Add `tests/use-lobby-connection.test.tsx` (render the hook with a fake `GameClient` that emits scripted events; assert `view`/`connectionState`/`isStarting`/etc. transitions and that `actions.start()` calls `gameClient.startGame()`). Run green; commit.
- [ ] **Task 4 — Route consumes the hook.** Rewrite `routes/lobby.$lobbyId.lazy.tsx` to call `useLobbyConnection(...)` and render the existing dumb components from its return; delete the now-moved logic. Run the **full** multiplayer suite: `pnpm test --run tests/lobby-route.test.tsx tests/lobby-ws-handler.test.ts tests/lobby-multi-announce.test.tsx tests/grid-presence.test.tsx tests/presence-overlay.test.tsx tests/end-game-modal.test.tsx tests/websocket-game-client.test.ts tests/reconnecting-game-client.test.ts` → all PASS unchanged. `pnpm typecheck && pnpm lint`. Commit.
- [ ] **Task 5 — PR.** Branch `refactor/lobby-connection-hook`. Include the spec doc. Body: workstream (frontend, `ui/components/lobby`), "behaviour-preserving extraction; prod route now a thin container over `useLobbyConnection`; v2 multiplayer will consume it", line counts, full-suite-green output. Open PR; auto-fix CI to green; §6a to LGTM; merge before W2.

**Acceptance:** prod `/lobby/$id` behaves identically; suite green; `useLobbyConnection` exported + unit-tested; route materially smaller.

---

## Wave 2 — `/v2/lobby/$id` + v2 Salon  *(detailed after W1 merges — interface = W1's `LobbyConnection`)*

**Deliverable:** a v2 **Salon** (WAITING) at `/v2/lobby/$lobbyId`, consuming `useLobbyConnection`.

**Files:** `routes/v2.lobby.$lobbyId.tsx` (loader = `LobbyClient.getLobby`; register in `router.ts` under `DEV && multiplayer`); `ui/v2/multiplayer/SalonScreen.tsx` (dumb: takes `LobbyConnection` + renders v2 PhoneShell + shareable code w/ copy, v2 `PlayerList` w/ presence + owner badge, owner grid-size picker + `Jouer` (sakuraDark), rename, leave).

**Key tasks (outline):** route + gating + loader; `SalonScreen` against the W1 interface; v2 player-list/code components; vitest + `expectAxeClean`; render-verify WAITING vs `multiplayer-v2.html` screen 1 at 430px. PR `feat/v2-salon`.

---

## Wave 3 — v2 live co-op grid (IN_PROGRESS)  *(detailed after W2)*

**Deliverable:** the IN_PROGRESS view — the v2 `PlayGrid` shared in real time, a presence layer, a live timer, a player strip.

**Files:** `ui/v2/multiplayer/LiveCoopScreen.tsx` (smart-ish container: `useLobbyConnection` → grid + overlays), `CoopPresenceLayer.tsx` (others' focused cells in their colours — restyle of `PresenceOverlay`/`usePresenceState`), `PlayerStrip.tsx`, `LiveTimer.tsx`. Reuse the v2 `PlayGrid`/`Cell` from `/v2/play`; wire `actions.cellUpdate`/`cellFocus`.

**Key tasks (outline):** presence layer over the v2 grid; timer from lobby start; player strip; **`aria-live` Announcer for join/leave/solved** (ADR-0050 — also advances the `/v2/play` Announcer gap); vitest + axe; two-client smoke via `dev:preview`. PR `feat/v2-coop-live`.

---

## Wave 4 — Résultats + `/v2/join` + home entry  *(detailed after W3)*

**Deliverable:** the COMPLETED results view, the join-by-link route, and the home entry.

**Files:** `ui/v2/multiplayer/ResultatsScreen.tsx` (co-op finish: "Résolue !", final time, contributors, "Rejouer" → new lobby, home; **no winner/scores**); `routes/v2.join.$code.tsx` (`LobbyClient.findByCode` → join → redirect `/v2/lobby/$id`, mirroring prod `join.$code`); `HomeScreen.tsx` flag-gated "Jouer à plusieurs" button → create lobby → `/v2/lobby/$id`.

**Key tasks (outline):** Résultats component + wiring to COMPLETED state; join route + redirect + error boundary; home entry (flag-gated, AA `sakuraDark`); vitest + axe; render-verify screen 3 vs mockup. PR `feat/v2-coop-results-join-entry`.

---

## Self-review

- **Spec coverage:** reuse-hook + smart/dumb split → W1; Salon → W2; live grid + presence + timer + Announcer → W3; Résultats + join + entry → W4; gating (`DEV && multiplayer`) → W2/W4; AA → every wave; versus/scoring explicitly out → not planned. ✓
- **Placeholders:** W2–W4 are intentionally outlined (reshaped post-W1 per the maintainer's wave workflow), not placeheld — W1 (next) is fully tasked. The `LobbyConnection` interface is concrete and finalized in W1/Task 1. ✓
- **Type consistency:** `useLobbyConnection` / `LobbyConnection` / `actions.*` names are used identically across waves. ✓
