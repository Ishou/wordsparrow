# README infra-diagram cosmetic styling

## Status

Approved (brainstorm 2026-06-11). Ready for implementation planning.

## Context

`README.md` carries five generated Mermaid `flowchart LR` diagrams (cluster,
cloud, flow, observability, clue-pipeline). They are emitted by
`scripts/infra_diagrams/render.py` from `docs/infra/topology.yaml`, injected
between `<!-- INFRA-DIAGRAM:* -->` markers, and gated by the
`readme-diagrams-drift` CI workflow (regenerate with `make diagrams`). Today
every node renders with Mermaid's default theme — zero styling. This is a
**cosmetic-only** change: no edges, nodes, captions, or topology semantics change.

### Hard constraint: GitHub renders Mermaid in both light and dark mode

Hardcoded colors apply in **both** modes (there is no per-mode switch). Two
consequences drive the whole design:

1. **Zone/node tints use translucent fills** (8-digit hex, e.g. `#6a93581f`)
   so the wash sits over whatever the page background is — faint on white,
   faint on dark. Nodes are left otherwise unstyled so their label text
   adapts per theme. `rgba()` is avoided because its commas break Mermaid's
   style-property parser; 8-digit hex is used throughout.
2. **Borders are opaque mid-tones** chosen to read on both backgrounds.

### Palette

Colors are drawn from the product's "forest/honey" palette (ADR-0043,
`frontend/panda.config.ts`) so the README diagrams match the app.

| Role               | Zone wash (subgraph) | Node wash       | Border / stroke |
|--------------------|----------------------|-----------------|-----------------|
| our code / context / source | `#6a93581f` (green) | `#6a935826` | `#6a9358` |
| data store         | —                    | `#c8945633` (honey) | `#a87538` |
| messaging / analytics / human-in-loop | `#a875381f` (amber) | `#a8753826` | `#c89456` |
| external / alerting | `#b8554020` (terracotta) | `#b8554022` | `#b85540` |
| platform / infra   | `#5a655a1f` (neutral) | —          | `#8b9488` |

## Decision

### Visual language (settled in brainstorm)

- **Zone tints** on subgraphs, by the group's dominant role (translucent
  wash + mid-tone border).
- **Honey node fill** for every datastore (`*DB` Postgres cylinders,
  ClickHouse, the clue-pipeline grid corpus).
- **Role node-tints** only where a diagram has no subgraphs (flow,
  clue-pipeline), so the language still carries.
- **Rounded label boxes** — padding `3px 8px`, `border-radius: 6px`, keeping
  Mermaid's own opaque, theme-adaptive label background untouched (no fill
  override). See portability note below.

Per-diagram assignment (exact node→class and group→wash mapping, as previewed
and approved):

- **Figure 1 — cluster.** Zones: `ctx_*` green, `Messaging` amber, `Edge`
  neutral. Nodes: `*DB` honey (data), `cluepipeline` terracotta (external).
- **Figure 2 — cloud.** Zones: `CI` neutral, `Cloud` terracotta.
- **Figure 3 — flow.** No subgraphs → node tints: `grid`/`game` green,
  `nats` amber.
- **Figure 4 — observability.** Zones: `Sources` green, `Ingest` neutral,
  `Backend` neutral, `Analytics` amber, `Alerting` terracotta. Node:
  `clickhouse` honey.
- **Figure 5 — clue-pipeline.** No subgraphs → node tints: `gen`/`sft`
  green (model stages), `human` amber (human-in-loop), `grid` honey (corpus).

### Portability — two tiers

- **Portable (ships unconditionally):** all zone and node tints. These use
  Mermaid `classDef` / `class` / `style` directives, which GitHub renders.
- **Conditional (verify first):** the rounded label boxes. Padding and
  border-radius require injected CSS (`themeCSS`), and GitHub renders Mermaid
  at a stricter `securityLevel` that likely strips it. **Before committing
  the label rounding, push a one-diagram test (gist or throwaway PR) and
  confirm it renders on GitHub in both modes.** If stripped, drop the
  rounding and keep Mermaid's default square label boxes — everything else
  is unaffected.

### Implementation surface

- Extend `scripts/infra_diagrams/render.py` so each `render_*` function
  emits the `classDef` block, `class` assignments, and per-subgraph `style`
  lines for its diagram. The role→color mapping lives as a small shared
  constant (single source of truth across the five renderers).
- If the label rounding survives the GitHub check, the `themeCSS` init
  directive is emitted once per diagram (prepended to the `flowchart`
  block as `%%{init: ...}%%`).
- Regenerate with `make diagrams`; the `readme-diagrams-drift` gate must be
  green. Update `scripts/infra_diagrams/test_generate.py` to cover the new
  emitted-style output so the styling can't silently regress.
- No change to `topology.yaml` structure, captions, edges, or the coherence
  checks — color is presentation, derived in the renderer, not declared data.

## Consequences

- **Easier:** the README diagrams read by role at a glance and match the
  product palette; the styling is centralized in the renderer, so a future
  palette change is one constant.
- **Harder / watch:** any new role or group added to a diagram needs a
  mapping entry, or it renders unstyled (acceptable, visible, non-breaking).
- **Risk accepted:** label rounding may not ship if GitHub strips `themeCSS`;
  the design degrades gracefully to default boxes.

## Out of scope

- The cluster-diagram **edge crossing** (`publishes` → NATS). Investigated
  structural reworks (per-subgraph `direction TB`, `flowchart TB`, statement
  reordering) and the **ELK** layout engine; none satisfied, so the layout
  is unchanged. Explicitly not pursued here.
- Any change to diagram content, topology, edges, captions, or wording.
- New diagrams or new ADRs (no architectural decision is being made).
