# ADR-0074: v1 → v2 design production cutover

## Status

Proposed, 2026-06-28. Resolves the migration follow-up deferred by
[ADR-0072](./0072-wordsparrow-design-system-v2.md) ("existing components remain
live until the migration effort; this ADR governs the new standalone module
only"). Respects ADR-0002 (frontend stack), ADR-0050 (a11y baseline), ADR-0072
(v2 visual language).

## Context

ADR-0072 introduced the v2 design (jade/sakura/khaki) as a **dev-only**
standalone surface. In `frontend/src/ui/router.ts` the entire `/v2/*` subtree is
registered behind `import.meta.env.DEV`, so **production still serves the v1
forest-palette app**. v2 is now feature-built for the core loop (home, play,
grilles, results, co-op, join/lobby, réglages, legal) and validated on
phone/tablet/desktop, so the question is no longer *whether* but *how* to make
it the production default without dropping live v1 features.

### Route coverage (v1 prod → v2)

| v1 route | v2 equivalent | Status |
|---|---|---|
| `/` (accueil) | `/v2` (home) | ✅ covered |
| `/grille` (play) | `/v2/play` | ✅ covered |
| `/grilles` (archive) | `/v2/grilles` | ✅ covered |
| `/finish` (results) | `/v2/finish` | ✅ covered |
| `/confidentialite` | `/v2/confidentialite` | ✅ covered |
| `/mentions-legales` | `/v2/mentions-legales` | ✅ covered |
| `/join/$code` | `/v2/join/$code` | ✅ covered |
| `/lobby/$lobbyId` | `/v2/lobby/$lobbyId` | ✅ covered |
| `/compte` (account) | `/v2/reglages` (sign-in only) | ⚠️ partial |
| `/aide` (help) | — | ❌ gap (v1 nav item) |
| `/contribuer`, `/contribuer/pairs` | — | ❌ gap (v1 nav item, real feature) |
| `/privacy` (EN privacy) | — | ❌ gap |

The gaps are live: `Contribuer` and `Aide` are primary items in the v1
`AppHeader`; `/compte` is linked from `AvatarMenu` and `PrivacyNotice`;
`/privacy` is the English-language privacy page. v2's nav exposes only
**Accueil** and **Grilles**.

## Decision

Make v2 the production default via a **redirect-first, expand-and-contract**
cutover. v2 routes graduate to always-registered; v1 routes become redirects;
v1 code is deleted only once nothing references it.

### 1. Route disposition

- **Covered routes** — v1 path 301-style redirects to the v2 path
  (`/grille → /v2/play`, `/grilles → /v2/grilles`, etc.). Existing bookmarks
  and share-links keep working.
- **`/compte`** — redirect to `/v2/reglages`. Réglages already hosts sign-in;
  full account management (delete data, etc.) is tracked as a v2 réglages
  follow-up, not a cutover blocker.
- **`/privacy`** — redirect to `/v2/confidentialite` (single privacy page;
  the EN variant is dropped, matching the tutoiement/French-first posture).
- **`/aide`** — fold help into v2: add a "Nous écrire / Aide" entry already
  present in `/v2/reglages`. Redirect `/aide → /v2/reglages`.
- **`/contribuer`, `/contribuer/pairs`** — **NOT covered by v2 and a real
  feature.** Two options, maintainer decides (see Open question):
  - **(a) Carry forward unreskinned** — keep the v1 contribuer screens mounted
    at `/contribuer` during the cutover (v1 shell), linked from the v2 menu, and
    reskin in a later wave. Zero feature loss.
  - **(b) Park** — redirect `/contribuer → /v2` and drop the nav entry until a
    v2 contribuer is built. Feature temporarily removed.
  Recommended: **(a)** — never drop a live feature in a visual cutover.

### 2. Router change

Remove the `import.meta.env.DEV` gate from the v2 subtree; register `/v2/*` in
all environments. Move the index: the root index route renders the v2 home
(or the root `/` redirects to `/v2`). v1 base routes become `redirect`
loaders. The `multiplayer` flag still gates the lobby/join routes (ADR-0018).

### 3. Sequencing (expand-and-contract — CLAUDE.md)

1. **Wave 1 — this ADR** (governance). Decide the contribuer disposition.
2. **Wave 2 — flip + redirects.** Un-gate `/v2/*`, redirect v1 paths, root → v2.
   v1 screen code stays in the tree (now unreachable except via carried-forward
   contribuer). Ship dark/measure; this is the reversible step.
3. **Wave 3 — contract.** Delete the now-dead v1 screens, `AppHeader`,
   `PrivacyNotice` (v1), v1-only components, and their routes/tests, once Wave 2
   has soaked and nothing imports them.

## Consequences

- **Easier:** one production design; the dev-only `/v2` split disappears; the
  desktop/tablet responsive work (PR #1054) reaches real users.
- **Harder / risk:** the cutover touches the router (a load-bearing file under
  ADR-0054); redirects must preserve search params (e.g. `/grille?date=`).
  Wave 2 must keep v1 code compiling until Wave 3 (expand-and-contract), so the
  tree briefly carries both designs.
- **Reversible:** Wave 2 is a router-only change; reverting re-gates `/v2`.
- **Open question (blocks Wave 2 scope):** contribuer disposition — carry
  forward unreskinned (recommended) or park? The rest of the cutover is
  unambiguous.
