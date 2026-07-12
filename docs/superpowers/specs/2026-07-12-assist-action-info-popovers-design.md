# On-demand info popups for assist actions

Date: 2026-07-12
Status: Approved (design)
Bounded context: `frontend/` — `ui/` layer

## Problem

Some gameplay controls have non-obvious behavior and hidden rules that a
first-time player cannot guess from the label alone. The clearest example is
**"Vérifier"** in the solo `PlayScreen`: the label does not convey that it
submits the letters you have typed, locks the correct ones, flags the wrong
ones, and is gated behind a **30-minute, server-authoritative cooldown**. The
onboarding Tour teaches this once, but there is no way to re-learn it on demand.

Give players an on-demand, discoverable explanation of these actions without
adding permanent visual clutter and without a separate help screen.

## Scope (first cut)

The **assist actions**, plus honesty fixes to the static help surfaces that
describe them:

- **Vérifier** + its 30-minute cooldown mechanic (in-context popover).
- **Hint** + its 10-minute cooldown mechanic (in-context popover).
- **`/aide` page** — the "Validation et indices" section is stale (it claims
  solo auto-validates on completion and that a hint reveals the whole word).
  Rewrite it as **generic, feature-agnostic** help copy that names no specific
  mechanic, so it can't drift.
- **Onboarding Tour** — the same two false claims live in `tour.validation.body`
  and `tour.hints.body`. Genericise both. The tour's assist step also targets a
  **broken selector** (`[aria-label^="Indice ("]`), which matches nothing now
  that the active assist is Vérifier — re-anchor it to a stable
  `data-tour="assist"` hook.

`src/ui/components/grid/assistMode.ts` currently hardcodes
`ACTIVE_ASSIST_MODE = 'verify'`, so only the Vérifier button renders today. We
build the popover pattern for both so the Hint popup is ready the moment that
flag flips. No other controls (sound, settings, report, zoom, co-op direction
switch) are in this cut.

**Copy principle (maintainer directive):** the in-context popover — which lives
*on* the button and therefore can't drift — is specific about what the action
does. The static `/aide` + Tour surfaces are kept **generic** ("un bouton
d'aide dans le bandeau te donne un coup de main") so they survive
verify↔hint↔settings churn.

## Design

### Component — reusable `InfoPopover` primitive

New primitive at `src/ui/components/primitives/InfoPopover.tsx`, built on
**Ark UI `Tooltip`**. Ark UI Tooltip is already a dependency and already used
once (`src/ui/components/sondage/StyleTooltip.tsx`) — **no new dependency, so no
ADR is required**. `InfoPopover` generalizes that bespoke implementation into a
shared component.

- Wraps an existing trigger element (the real Vérifier / Hint button) and, via
  `cloneElement`, injects the click handler, the long-press handlers, and
  `aria-disabled` onto it, then renders it through Ark's `asChild`.
- Props: `info` (string from i18n), `onActivate` (the action), `disabled`
  (guards the action), `children` (the button, which must **not** set its own
  `onClick`).
- Ark wires `aria-describedby` from trigger → content automatically; no extra
  ARIA plumbing needed. The button keeps its existing `aria-label`.
- Styled with Panda `css()`, mirroring `StyleTooltip` (Portal → Positioner →
  Content → Arrow/ArrowTip).

**Disabled must stay explainable.** The assist button is disabled both on
cooldown *and* when the user is signed out (the `useAssistGate` capability
gate). A native `disabled` button swallows hover/pointer events, so the
explanation would be unreachable exactly when it matters most (a signed-out
player staring at a greyed-out button). Therefore the button uses
**`aria-disabled` + a guarded click**, never native `disabled`: it stays
focusable and hoverable, the popover opens in every state, and `InfoPopover`'s
`disabled` prop blocks `onActivate`. This is a UX-affordance change, not an
authz change — `solver.verify` is auth-enforced server-side regardless.

### Interaction model

Branch on the existing `useTouchPrimary()` hook
(`src/ui/components/keyboard/useTouchPrimary.ts`,
`matchMedia('(any-pointer: coarse) and (any-hover: none)')`):

- **Fine pointer (desktop):** uncontrolled Ark Tooltip. Opens on **hover +
  focus**, `openDelay ≈ 400ms`, closes on blur / Esc / mouse-leave. Handled
  entirely by Ark.
- **Touch (coarse, no-hover):** a new `useLongPress()` hook drives Ark's `open`
  in **controlled** mode.
  - `pointerdown` starts a ~500ms timer.
  - If the timer fires: open the popup **and** set a `suppressNextClick` ref so
    the release does **not** also run Vérifier/Hint.
  - Pointer movement beyond a small threshold, or release before the timer, or
    `pointercancel`: clear the timer. A normal tap therefore runs the action
    with no popup.
  - Dismiss on tap-outside / scroll / Esc — persistent until dismissed.

The button's `onClick` checks and consumes `suppressNextClick`: if a long-press
just opened the popup, the click is swallowed (action does not run); otherwise
it runs normally.

`useLongPress` is the only genuinely new logic and is unit-tested in isolation.

### Copy / i18n

Static French strings added to `src/ui/i18n/messages.fr.ts`, following the
existing `play.verify.*` / `play.hint.*` namespaces. No `{{placeholder}}`
interpolation, so no dev-mode `t()` throw risk.

- `play.verify.info`:
  "Vérifie les lettres que tu as saisies : les bonnes se verrouillent, les
  autres sont signalées. Disponible toutes les 30 minutes."
- `play.hint.info`:
  "Révèle une lettre de la case active. Un nouvel indice toutes les 10 minutes."

**State-aware content (two messages).** The popover shows the *reason* when the
action is blocked by the auth gate, otherwise the what-it-does description:

- Signed out → `assistGate.title` (existing `auth.assistGate.anon` =
  "Connecte-toi pour vérifier ta grille.").
- Enabled **or** on cooldown → `play.verify.info` — which already states
  "Disponible toutes les 30 minutes", so it doubles as the cooldown
  explanation. No dedicated cooldown string.

The live countdown remains where it already is — the `AssistCooldown` conic
ring (`src/ui/components/grid/AssistCooldown.tsx`); the popover explains the
mechanism, the ring shows the live seconds.

### Accessibility (ADR-0050, WCAG AA)

- Ark wires `aria-describedby` from trigger to content; button retains its
  `aria-label`.
- Content-on-hover-or-focus (WCAG 1.4.13): **dismissible** (Esc / tap-outside),
  **persistent** (stays until dismissed), does not obscure the trigger.
- Keyboard: focus opens on desktop, Esc closes. No focus trap — content is
  non-essential.
- **`aria-disabled` over native `disabled`** so the disabled button stays
  focusable and its explanation reachable (the recommended pattern for a
  disabled control that still needs a tooltip); the click guard prevents the
  action, matching the visual disabled state.

### Testing

- **`useLongPress` unit tests** (vitest, fake timers): timer fires →
  `onLongPress` invoked and click suppressed; short press → not suppressed;
  move / cancel before threshold → no fire.
- **`InfoPopover` component test** (RTL): renders its child as the trigger,
  `aria-describedby` is present and points at content, focus opens the content
  (jsdom cannot simulate hover, so the focus path is asserted).

## Files touched

- **new** `src/ui/components/primitives/InfoPopover.tsx` (+ Panda styles)
- **new** `src/ui/components/primitives/useLongPress.ts`
- **edit** `src/ui/play/PlayScreen.tsx` — wrap the Vérifier (and dormant Hint)
  buttons with `InfoPopover`
- **edit** `src/ui/i18n/messages.fr.ts` — 2 keys
- **new** test files for `useLongPress` and `InfoPopover`

Estimated ~250 non-generated lines — within the 400-line PR cap, one
workstream, `feat(frontend-grid):` scope.

## Non-goals / future

- No `(i)` info icon affordance in this cut (longpress-first, per the design
  decision). Revisit if longpress proves undiscoverable.
- No live cooldown time inside the popup (the conic ring already shows it).
- Other non-self-evident controls (sound, settings, report/flag, co-op "Espace"
  direction switch, zoom, nav arrows) are candidates for a later wave reusing
  `InfoPopover`.
