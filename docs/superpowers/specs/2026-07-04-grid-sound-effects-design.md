# Grid sound effects (mutable) — design

**Date:** 2026-07-04
**Bounded context:** `frontend/` (layers: `application/`, `infrastructure/`, `ui/`)
**Schemas shipped first:** none
**ADR:** none new — reuses the ADR-0088 preference-store pattern and
ADR-0002 §7 router-context injection. No new dependency (Ark UI `Switch`
and the Web Audio API are both already in scope).

## Context

The grid gives visual feedback when a word validates and when a puzzle is
solved, but no audible reward. We want two subtle, synthesized reward cues
on the grid, on by default, muteable from Réglages. The product direction
is serene-elegant naturalist (jade/sakura/khaki), so the sounds must be
soft and harmonic — never arcade-y — and confined to *positive* moments.

## Scope

- **In:** two synthesized cues — **word validated** and **puzzle solved** —
  played via the Web Audio API; a single **on/off** preference (default on),
  persisted in `localStorage`; a toggle row in Réglages.
- **Out (YAGNI):** volume slider, per-sound toggles, keystroke sounds,
  wrong/error sounds, bundled audio asset files, backend persistence of the
  preference.

## Decision

### Architecture (mirrors the ThemeStore pattern)

Hexagonal, following the exact shape already used for the theme preference
(ADR-0088; injected via router context per ADR-0002 §7):

- **`SoundStore` port** — `application/session/SoundStore.ts`. The
  *preference*:
  - `load(): boolean` — current persisted value, **default `true`**.
  - `set(enabled: boolean): void` — persist.
  - Adapter: `infrastructure/session/localStorageSound.ts` — one
    `localStorage` key (`ws:sound`), tolerant of missing/corrupt values
    (falls back to `true`).
- **`SoundPlayer` port** — `application/session/SoundPlayer.ts`. The *cues*:
  - `playWordValidated(): void`
  - `playPuzzleSolved(): void`
  - Adapter: `infrastructure/session/webAudioSoundPlayer.ts`. Lazily
    creates a single `AudioContext` on first play, synthesizes each cue
    with `OscillatorNode` + `GainNode` envelope, and **self-gates**: every
    `play*()` is a no-op when the preference reports disabled. The adapter
    is constructed with the store's `load` as its enabled-getter, so the
    mute check lives in exactly one place and there is no stale cached
    flag. It degrades silently where `AudioContext` is unavailable
    (jsdom/tests, unsupported browsers) — never throws.
- Both are instantiated once and threaded through **router context**
  alongside `themeStore` (`main.tsx` → `ui/routes/__root.tsx`), so any
  screen reads them the same way `ReglagesScreen` reads `themeStore` today.

### The sounds (Web Audio synthesis)

Both use a quick attack + gentle exponential decay (no clicks) and a low
peak gain (~0.15) so they sit under the UI. Exact frequencies/envelopes are
tunable by ear during implementation.

- **Word validated** — a soft **two-note rising chime** (perfect-fifth
  interval, sine, ~180 ms). Marks each "click into place" as a word locks
  in.
- **Puzzle solved** — a gentle **three-note ascending arpeggio**
  (sine/triangle, ~500 ms), a warmer flourish that reads as "done" without
  fanfare.

### Triggers (in `ui/play/PlayScreen.tsx`)

- **Word validated:** watch `validatedPositions` for *newly added* words
  (diff against the previous render) and call `playWordValidated()` once per
  new validation.
- **Puzzle solved:** call `playPuzzleSolved()` once on the won transition.
- **Both reuse the existing `userActedRef` gate** — the same guard
  (`PlayScreen.tsx:400`) that stops the win screen from celebrating when a
  finished grid is merely reopened. Loading a solved/in-progress puzzle from
  persistence is therefore silent; only in-session progress makes sound.
  This also guarantees the `AudioContext` only resumes after a real
  keystroke (a user gesture), so there is no autoplay-block issue.

### The setting (Réglages)

- A new **"Son"** group placed directly after "Apparence" in
  `ui/v2/ReglagesScreen.tsx`: a single card with one toggle row —
  label **"Sons"**, sub **"Effets sonores de la grille"**, an **Ark UI
  `Switch`** on the right, styled with Panda to the jade/sakura palette
  (≥44px tap target, `_focusVisible` ring consistent with the other rows).
  Wired to `soundStore` exactly as the theme control is wired to
  `themeStore`.
- French copy uses **tutoiement**.

## Testing

- **`localStorageSound`** — unit: default `true`; round-trips `set`/`load`;
  tolerates corrupt/missing values (mirror the ThemeStore adapter tests).
- **`webAudioSoundPlayer`** — unit with an injected fake `AudioContext`:
  disabled → **creates no oscillator** (the gate); enabled → creates the
  expected nodes; absent `AudioContext` → no throw. TDD the gate first.
- **Trigger effect** — a newly-validated word calls `playWordValidated`
  once; a persisted/mount-time validated set does **not**; the won
  transition calls `playPuzzleSolved` once.
- **A11y** — the toggle is reachable/operable by keyboard with an accessible
  name; sounds are purely decorative (validation is already conveyed
  visually), so there is no WCAG "information through sound only" concern.

## Consequences

- **Easier:** a positive-only, on-by-default reward loop most players will
  actually hear; a clean mute affordance; zero asset-pipeline or licensing
  cost.
- **Harder / watch:** synthesized tones are simpler than produced SFX (an
  accepted aesthetic trade-off); Web Audio requires the lazy-resume-on-
  gesture handling described above; the `validatedPositions` diff must not
  double-fire or fire on mount (covered by the `userActedRef` gate + tests).
- **Different:** a second preference store now rides in router context
  next to `themeStore`; the pattern is established, so this is additive.

## Size

Small, self-contained frontend workstream — well under the 400-line cap.
No schema, no ADR, no new dependency.
