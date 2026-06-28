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
| `/compte` (account) | `/v2/compte` (#1058) | ✅ ported |
| `/aide` (help) | `/v2/aide` (#1056) | ✅ ported |
| `/contribuer`, `/contribuer/pairs` | — | ⛔ fully gated (maintainer follow-up) |
| `/privacy` (EN privacy) | — | redirect → `/confidentialite` |

The remaining open gap is `Contribuer`/`Contribuer pairs` — a primary v1 nav item
with no v2 equivalent yet, fully gated for normal users pending a maintainer-role
follow-up. `/privacy` is covered by redirect to `/confidentialite`.

## Decision

Make v2 the production default by **promoting the v2 routes to the root path
(dropping the `/v2` prefix) and removing v1** — `/v2` is not a permanent URL
space, it was only the dev sandbox. So `/v2` → `/`, `/v2/play` → `/play`,
`/v2/reglages` → `/reglages`, etc., and the v1 screens are deleted. Old v1 URLs
whose path *changes* keep working via redirects (bookmark/SEO continuity); where
v2 already reuses the v1 path name (`/grilles`, `/compte`, `/confidentialite`,
`/mentions-legales`, `/finish`, `/join`, `/lobby`) no redirect is needed — v2
simply takes the path once v1 is gone.

### 1. Route disposition (at root, after the prefix drop)

- **Same-name paths** — v2 takes them directly: `/grilles`, `/compte`,
  `/confidentialite`, `/mentions-legales`, `/finish`, `/join/$code`,
  `/lobby/$lobbyId`.
- **Renamed paths** — redirect the old v1 URL to the new root path:
  `/accueil` (and v1 `/`) → `/` (v2 home), `/grille → /play`,
  `/privacy → /confidentialite` (EN variant dropped — French-first/tutoiement).
- **`/aide`, `/compte`** — already ported to v2 (#1056, #1058); they keep their
  paths at root.
- **`/contribuer`, `/contribuer/pairs`** — **fully gated for now**: not exposed
  in v2 (no nav entry, route unregistered for normal users). The v1 contribuer
  screens are kept in the tree on their v1 design; a follow-up un-gates them for
  the **maintainer account only**. That follow-up needs identity to expose a
  role in `whoami` (today `WhoAmIResult` is just `{userId, displayName}`).

### 2. Router change

In `frontend/src/ui/router.ts`: drop the `import.meta.env.DEV` gate, remove the
`/v2` parent route, and register the (ex-v2) screens as **root children** with
their prefix removed. Delete the v1 base routes (keeping contribuer in the tree
but unregistered). Rewrite every internal `/v2/...` link and `navigate({ to })`
in the v2 components to the new root paths. The `multiplayer` flag still gates
the lobby/join routes (ADR-0018).

### 3. Sequencing (expand-and-contract — CLAUDE.md)

1. **Wave 1 — this ADR** (governance). Contribuer disposition **decided**:
   full-gate now, un-gate for the maintainer in a follow-up.
2. **Wave 2 — promote + redirect.** Drop the `/v2` prefix (v2 → root), delete v1
   routes, redirect the renamed v1 paths, rewrite internal `/v2/...` links.
   Contribuer kept in the tree but unregistered. This is the reversible step
   (router-only; reverting restores the `/v2` dev gate).
3. **Wave 3 — contract.** Delete the now-dead v1 screens, `AppHeader`,
   `PrivacyNotice` (v1), v1-only components, and their routes/tests, once Wave 2
   has soaked and nothing imports them. Contribuer stays until its v2/maintainer
   follow-up lands.

## Consequences

- **Easier:** one production design; the dev-only `/v2` split disappears; the
  desktop/tablet responsive work (PR #1054) reaches real users.
- **Harder / risk:** the cutover touches the router (a load-bearing file under
  ADR-0054); redirects must preserve search params (e.g. `/grille?date=`).
  Wave 2 must keep v1 code compiling until Wave 3 (expand-and-contract), so the
  tree briefly carries both designs.
- **Reversible:** Wave 2 is a router-only change; reverting restores the `/v2`
  dev gate.
- **Follow-up dependency:** un-gating contribuer for the maintainer needs a role
  exposed in `whoami` (identity change) — out of scope for the cutover itself.
