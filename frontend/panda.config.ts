import { defineConfig } from '@pandacss/dev';

// Panda CSS — ADR-0002 §3 + ADR-0043 (WordSparrow nature/forest visual
// direction; supersedes ADR-0005 §4 palette).
//
// Three-tier color system:
//
//   1. **Ramps** (`tokens.colors`): four tonal scales (primary / secondary /
//      neutral at 50–900; terra sparse at 100–900 — error has narrower usage
//      than brand ramps).
//      - `primary`   — mousse (moss-green brand + success).
//      - `secondary` — miel (honey amber — cursor, in-progress, focus).
//      - `neutral`   — papier + encre (cream paper bg, forest-deep ink
//                      text, sand bordure mid-tones). Warm, paper-toned.
//      - `terra`     — terracotta (error). Distinct hue from secondary,
//                      so error stops aliasing onto the honey ramp.
//
//   2. **Semantic role tokens** (`semanticTokens.colors`): every UI role
//      maps to a ramp shade here. Components reference these names, not
//      ramp shades directly — that's the whole indirection point.
//      Adding a new role is one line below; palette-swapping is changing
//      this file ONLY.
//
//   3. **Components**: reference role tokens (`bg: 'surface'`, `color:
//      'accent'`) or, when a state derivation needs a specific shade
//      (`_hover: { bg: 'primary.700' }`), the renamed ramp.
//
// Palette-swap workflow (this file is the only edit point for visual
// re-themes):
//   1. Re-tune ramps for the new palette (primary / secondary / neutral
//      / terra). Anchors are the load-bearing stops cited in the ADR;
//      interpolated stops are best-effort perceptual ramps.
//   2. Re-map semantic roles to whichever ramp stop carries the right
//      shade for that role. No component code changes required.
//
// Accessibility: WCAG AA contrast is verified at every brand-color
// usage site via `pnpm a11y` (axe-core through Playwright). ADR-0043's
// verification matrix calls out the borderline pairs; if axe-core
// fails one, tune the affected stop in the interpolated ramp range
// rather than touching anchor hexes. See ADR-0050 for the a11y
// baseline policy.
export default defineConfig({
  preflight: true,
  include: ['./src/**/*.{ts,tsx}'],
  exclude: [],
  jsxFramework: 'react',
  outdir: 'styled-system',
  conditions: {
    extend: {
      // ADR-0088: dark theme is class-driven (html[data-theme=dark]), set pre-paint from bliss.theme.
      dark: '[data-theme=dark] &',
    },
  },
  theme: {
    tokens: {
      colors: {
        // WordSparrow v2 (ADR-0072) `ws.*` colors live in semanticTokens (ADR-0088: light/dark pairs).
        // Primary ramp — mousse (moss-green brand + success/validation).
        // ADR-0043 anchors:
        //   .100 = #dfeacb (mousse pâle — accentBg, validated cell bg)
        //   .500 = #3f6431 (mousse main — wordmark, CTA, accent text)
        //                   AA tune: ADR anchor #5a8a4a (~4.5:1 on bg)
        //                   below AA threshold; darkened to ~6.3:1.
        //                   Hue unchanged; luminance shift only.
        //   .700 = #2d4920 (mousse profonde — hover, success text)
        //                   Proportionally darkened to preserve the
        //                   .500 → .700 visual separation.
        primary: {
          50:  { value: '#f0f5e8' },
          100: { value: '#dfeacb' },
          200: { value: '#c5d7a5' },
          300: { value: '#a8c180' },
          400: { value: '#6a9358' },
          500: { value: '#3f6431' },
          600: { value: '#365528' },
          700: { value: '#2d4920' },
          800: { value: '#1f3517' },
          900: { value: '#13230f' },
        },
        // Secondary ramp — miel (honey amber — cursor, in-progress,
        // focus, clue-cell surface). ADR-0043 anchors:
        //   .100 = #fbedd0 (miel pâle — secondaryBg, focusBg, clue bg)
        //   .500 = #c89456 (miel main — secondaryAccent, focusRing)
        //   .700 = #7a4e1a (miel profond — secondaryText, clue text)
        secondary: {
          50:  { value: '#fef7e6' },
          100: { value: '#fbedd0' },
          200: { value: '#f5dca8' },
          300: { value: '#eac480' },
          400: { value: '#dba968' },
          500: { value: '#c89456' },
          600: { value: '#a87538' },
          700: { value: '#7a4e1a' },
          800: { value: '#5a3a14' },
          900: { value: '#3d270c' },
        },
        // Neutral ramp — papier + encre (warm cream paper through
        // sand bordure to forest-deep ink). The page background is
        // paper, not hue-less; the warm cream is intentional ("le
        // papier" anchors the brand). ADR-0043 anchors:
        //   .50  = #faf6eb (papier crème — bg)
        //   .100 = #f5efe0 (papier chaud — surfaceElevated)
        //   .200 = #e0d8c4 (bordure sable — border)
        //   .300 = #d4ccb8 (trait de grille — gridLine)
        //   .500 = #5a655a (encre sourde — fgMuted)
        //                   AA tune: ADR anchor #6a7565 (~4.6:1) was
        //                   borderline; darkened to ~5.6:1. Hue unchanged.
        //   .900 = #1f2e25 (forêt profonde — fg, primary text)
        neutral: {
          50:  { value: '#faf6eb' },
          100: { value: '#f5efe0' },
          200: { value: '#e0d8c4' },
          300: { value: '#d4ccb8' },
          400: { value: '#a8a89a' },
          500: { value: '#5a655a' },
          600: { value: '#4a5450' },
          700: { value: '#2f3a35' },
          800: { value: '#262e2a' },
          900: { value: '#1f2e25' },
        },
        // Terra ramp — terracotta (error). Kept separate from secondary (honey)
        // — error must not share a hue with cursor/focus signals (ADR-0043).
        // Sparse stops — .200 added for the pale tinted-button hover (BAD verdict).
        // Anchors:
        //   .100 = #f5dccc (terracotta pâle — errorBg)
        //   .500 = #b85540 (terracotta main — error icon, accent)
        //   .700 = #9b3f2a (terracotta foncée — errorText; darkened
        //                   from #b85540 per ADR-0043 Option (a) so
        //                   errorText-on-errorBg clears AA small text)
        terra: {
          100: { value: '#f5dccc' },
          200: { value: '#eec3ad' },
          300: { value: '#e2967c' },
          500: { value: '#b85540' },
          700: { value: '#9b3f2a' },
          900: { value: '#5a2417' },
        },
        // (Note: `focusBg` is defined as a *semantic* token only —
        // see `semanticTokens.colors` below. We don't ship a
        // matching primitive because Panda's variable graph emits
        // duplicate atomic classes when a semantic-token name
        // collides with a primitive name, which silently broke the
        // focused-cell bg when both were named `focusBg`. If the
        // theme grows enough to want `focusBg.50`/.900 ramp stops,
        // pick a different family name like `interaction` first.)
      },
      spacing: {
        xs: { value: '0.25rem' },
        sm: { value: '0.5rem' },
        md: { value: '1rem' },
        lg: { value: '2rem' },
        xl: { value: '4rem' },
      },
      fonts: {
        // ADR-0043 §3 dead v1 stack (Outfit/Fraunces/Lekton); reachable only from unregistered v1 routes (ADR-0074).
        body: { value: '"Outfit Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
        heading: { value: '"Fraunces Variable", Georgia, "Times New Roman", serif' },
        // Lekton's constant advance lets clue_metrics.py use a pure char-count predicate.
        mono: { value: '"Lekton", ui-monospace, "SFMono-Regular", Menlo, "Cascadia Code", monospace' },
        // WordSparrow v2 (ADR-0072): Fredoka display, Nunito UI, Spline Sans Mono grid letters, Hanken Grotesk clues.
        wsDisplay: { value: '"Fredoka Variable", "Nunito Variable", system-ui, sans-serif' },
        wsUi: { value: '"Nunito Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
        wsMono: { value: '"Spline Sans Mono", ui-monospace, "SFMono-Regular", Menlo, monospace' },
        wsClue: { value: '"Hanken Grotesk Variable", "Nunito Variable", system-ui, sans-serif' },
      },
      // Type scale — ADR-0005 §5. Mobile-first sizes; the `md` breakpoint
      // bumps each by 1.125× via the `md` conditional in route styles.
      fontSizes: {
        display: { value: '2.5rem' },
        xl: { value: '1.875rem' },
        lg: { value: '1.5rem' },
        md: { value: '1.125rem' },
        body: { value: '1rem' },
        sm: { value: '0.875rem' },
        xs: { value: '0.75rem' },
        xxs: { value: '0.625rem' },
        cell: { value: '1.5rem' },
      },
      fontWeights: {
        regular: { value: '400' },
        medium: { value: '500' },
        semibold: { value: '600' },
        bold: { value: '700' },
        black: { value: '800' },
      },
      radii: { sm: { value: '4px' }, md: { value: '8px' }, lg: { value: '16px' } },
      // Panda can't resolve cross-file import constants; token required (ADR-0036).
      sizes: {
        pageMaxWidth: { value: '720px' },
      },
      shadows: {
        // Subtle near-black glow under floating surfaces (toggle,
        // dialog, dropdown). The rgba is intentionally not bound to
        // a token — it's a shadow tint, not a palette-swap dimension;
        // a light cream surface still wants a near-black-with-warmth
        // shadow rather than a tinted one.
        floating: { value: '0 2px 4px rgba(10, 10, 12, 0.6)' },
      },
    },
    semanticTokens: {
      colors: {
        // WordSparrow v2 chrome (ADR-0072 hues, ADR-0088 night values). Dark values preserve every
        // documented AA pairing; aesthetic re-balancing happens per-surface in the Wave B QA pass.
        ws: {
          jade: { value: { base: '#C4E5D3', _dark: '#2E4A3C' } },
          jadeInk: { value: { base: '#214B40', _dark: '#E9F2EC' } },
          // Text on jadeInk-filled pills — the fill flips near-white in dark, so its ink flips too.
          onJadeInk: { value: { base: '#FFFFFF', _dark: '#16241D' } },
          sable: { value: { base: '#E8E2C6', _dark: '#23301F' } },
          khaki: { value: { base: '#4C4824', _dark: '#A8B49B' } },
          or: { value: { base: '#D8C77A', _dark: '#8A7A3D' } },
          sakura: { value: { base: '#D45D83', _dark: '#D45D83' } },
          sakuraDark: { value: { base: '#BE4970', _dark: '#BE4970' } },
          sakuraRose: { value: { base: '#E586A4', _dark: '#E586A4' } },
          // Active-nav text — sakura is ~4.5:1 borderline on the night bar frost; rose clears it (~6.5:1 dark).
          navAccent: { value: { base: '#D45D83', _dark: '#E586A4' } },
          sakuraBlush: { value: { base: '#F7DEE7', _dark: '#3A2230' } },
          // Deep sage clue-cell surface; cream clueText clears AA in both themes (~5.3:1).
          clueSurface: { value: { base: '#4F6E5C', _dark: '#4F6E5C' } },
          // Solved-clue surface; pairs with jadeInk text — dark deepens so the flipped ink stays AA.
          clueSurfaceDone: { value: { base: '#9FBCA8', _dark: '#3C5A4B' } },
          clueText: { value: { base: '#FBF6E9', _dark: '#FBF6E9' } },
          // Uppercase group-label (eyebrow) — a text color, so it lightens on dark.
          eyebrow: { value: { base: '#543C00', _dark: '#CBBE83' } },
          // Ink pairing for gold (ws.or) surfaces.
          orInk: { value: { base: '#5A4B12', _dark: '#EFE6BC' } },
          // 1px separators on cards.
          hairline: { value: { base: '#EEF3EC', _dark: '#2C3B32' } },
          // Hover shades for jade / sable buttons.
          jadeHover: { value: { base: '#A9D8BE', _dark: '#3A5D4B' } },
          sableHover: { value: { base: '#DED7BC', _dark: '#2E3A28' } },
          // Multiplayer presence dots (legible on both themes).
          statusOnline: { value: { base: '#3F9D6E', _dark: '#3F9D6E' } },
          statusIdle: { value: { base: '#C9A227', _dark: '#C9A227' } },
          statusLost: { value: { base: '#9A9A9A', _dark: '#9A9A9A' } },
          // Elevated card surface — was a bg:'white' literal before ADR-0088.
          card: { value: { base: '#FFFFFF', _dark: '#1C2D25' } },
          // Frosted-glass surfaces over the hero backdrop (pills, round buttons, nav bars).
          glass: { value: { base: 'rgba(255,255,255,0.62)', _dark: 'rgba(23,41,33,0.72)' } },
          // Softer than glassHover — segmented-control off-state hover, byte-identical to its pre-tokenized light value.
          glassSoft: { value: { base: 'rgba(255,255,255,0.55)', _dark: 'rgba(23,41,33,0.6)' } },
          glassHover: { value: { base: 'rgba(255,255,255,0.82)', _dark: 'rgba(35,58,47,0.85)' } },
          glassBright: { value: { base: 'rgba(255,255,255,0.92)', _dark: 'rgba(40,63,52,0.9)' } },
          glassStrong: { value: { base: 'rgba(255,255,255,0.7)', _dark: 'rgba(23,41,33,0.8)' } },
          glassBorder: { value: { base: 'rgba(255,255,255,0.7)', _dark: 'rgba(233,242,236,0.14)' } },
          frost: { value: { base: 'rgba(255,255,255,0.9)', _dark: 'rgba(16,30,25,0.92)' } },
          // Sticky top-bar frost — jade-tinted in light, deep night in dark; hides content sliding under.
          barFrost: { value: { base: 'rgba(205,233,218,0.82)', _dark: 'rgba(14,31,26,0.86)' } },
          // Page hero gradient stops (consumed as CSS vars by the shells).
          heroTop: { value: { base: '#CDE9DA', _dark: '#0E1F1A' } },
          heroBottom: { value: { base: '#BBE0CD', _dark: '#14261F' } },
          heroFlat: { value: { base: '#9CCBB1', _dark: '#182720' } },
        },
        // ── Surfaces ────────────────────────────────────────────────
        bg:             { value: { base: '{colors.neutral.50}', _dark: '{colors.neutral.900}' } },     // page background (papier crème)
        surface:        { value: { base: '#ffffff', _dark: '#26332B' } },                 // letter cell ("cellule") — pure white paper
        // `surfaceVariant` is the def-cell ("clue") surface. The nature/
        // forest palette pairs a honey-pale fill (`secondary.100`) with
        // a honey-deep text (`secondary.700`) — the "indice fond / indice
        // texte" pair from the ADR-0043 mockup. Both halves stay in the
        // secondary ramp so the clue surface keeps its honey family.
        surfaceVariant: { value: { base: '{colors.secondary.100}', _dark: '#33270F' } },  // def cell — miel pâle
        surfaceMuted:   { value: { base: '{colors.neutral.200}', _dark: '{colors.neutral.800}' } },    // block / inert-cell — bordure sable
        // Elevated cream surface (e.g. progress-bar track behind a moss
        // fill). Slightly warmer than the page bg so layered panels read.
        surfaceElevated:{ value: { base: '{colors.neutral.100}', _dark: '#2A362E' } },
        // Component-specific token; keeps track tweaks isolated from `border` uses
        progressTrackPending: { value: { base: '{colors.neutral.300}', _dark: '#3A463F' } },

        // ── Foreground ──────────────────────────────────────────────
        fg:                 { value: { base: '{colors.neutral.900}', _dark: '#EDE9DA' } },  // primary text — forêt profonde on papier
        fgMuted:            { value: { base: '{colors.neutral.500}', _dark: '#9DA898' } },  // encre sourde — ~5.6:1 on bg (light) / ~5.8:1 (dark); AA-safe for de-emphasized small text
        // Text colour on the clue surface — ~6.2:1 on miel pâle (light) / ~8.8:1 on miel sombre (dark); AA both themes.
        onSurfaceVariant:   { value: { base: '{colors.secondary.700}', _dark: '{colors.secondary.300}' } },

        // ── Lines ───────────────────────────────────────────────────
        border:         { value: { base: '{colors.neutral.200}', _dark: '#37423B' } },  // UI borders — bordure sable
        gridLine:       { value: { base: '{colors.neutral.300}', _dark: '#3F4B44' } },  // grid cell perimeter + stack divider — trait de grille
        muted:          { value: { base: '{colors.neutral.200}', _dark: '#37423B' } },  // legacy alias of border (used by some lobby code)

        // ── Brand · primary (mousse — moss-green, also the success colour) ──
        // `accent` / `accentText` are aliases — same value, different
        // semantic intent at the call site (one reads as "the brand
        // colour", the other as "the colour for branded text").
        accent:         { value: { base: '{colors.primary.500}', _dark: '{colors.primary.300}' } },  // mousse — wordmark, current-clue, timer
        accentText:     { value: { base: '{colors.primary.500}', _dark: '{colors.primary.300}' } },  // alias for clarity
        accentBg:       { value: { base: '{colors.primary.100}', _dark: '{colors.primary.800}' } },  // mousse pâle (letter-in-word bg, validated cell bg)
        accentHover:    { value: { base: '{colors.primary.700}', _dark: '{colors.primary.200}' } },  // mousse profonde — hover state of solid primary CTAs

        // ── Brand · secondary (miel — honey amber, cursor + focus) ──
        secondaryAccent:{ value: { base: '{colors.secondary.500}', _dark: '{colors.secondary.400}' } },
        secondaryText:  { value: { base: '{colors.secondary.700}', _dark: '{colors.secondary.300}' } },
        secondaryBg:    { value: { base: '{colors.secondary.100}', _dark: '{colors.secondary.900}' } },

        // ── Status ─────────────────────────────────────────────────
        // `success` aliased onto mousse primary (validation cells,
        // progress, timer). `error` uses the dedicated `terra` ramp — kept
        // separate from secondary (honey) so error and focus carry distinct hues.
        success:        { value: { base: '{colors.primary.500}', _dark: '{colors.primary.300}' } },
        successBg:      { value: { base: '{colors.primary.100}', _dark: '{colors.primary.800}' } },
        successText:    { value: { base: '{colors.primary.700}', _dark: '{colors.primary.200}' } },
        error:          { value: { base: '{colors.terra.500}', _dark: '{colors.terra.300}' } },
        errorBg:        { value: { base: '{colors.terra.100}', _dark: '{colors.terra.900}' } },
        errorText:      { value: { base: '{colors.terra.700}', _dark: '{colors.terra.200}' } },     // #9b3f2a per ADR-0043 Option (a)

        // ── On-bg foregrounds ───────────────────────────────────────
        // Text colors paired with specific solid backgrounds.
        onAccent:       { value: { base: '#ffffff', _dark: '{colors.primary.900}' } },                  // text on solid mousse CTA / "Vérifier" button — pure white "sur mousse"
        onSecondary:    { value: { base: '{colors.secondary.700}', _dark: '{colors.secondary.900}' } },   // text on solid honey bg — miel profond

        // ── Focus ───────────────────────────────────────────────────
        // The focused letter cell uses `focusBg` (honey-pale wash) for
        // its background and an inset 1.5 px `focusRing` (honey main) for
        // the visual signal — see Cell.tsx letterInput `_focus`. Both
        // alias the secondary ramp; honey IS the cursor colour per
        // ADR-0043's semantic intent ("miel — calme action, en cours").
        focusBg:        { value: { base: '{colors.secondary.100}', _dark: '#33270F' } },
        focusRing:      { value: { base: '{colors.secondary.500}', _dark: '{colors.secondary.400}' } },

        // Band tri-state tokens: pristine → honey pale; modified → deeper honey; saved → mousse green.
        metaSuggestedBg:   { value: { base: '{colors.secondary.50}', _dark: '#2A2110' } },
        metaSuggestedLine: { value: { base: '{colors.secondary.300}', _dark: '{colors.secondary.600}' } },
        metaSuggestedText: { value: { base: '{colors.secondary.700}', _dark: '{colors.secondary.300}' } },
        metaModifiedBg:    { value: { base: '{colors.secondary.100}', _dark: '#33270F' } },
        metaModifiedLine:  { value: { base: '{colors.secondary.500}', _dark: '{colors.secondary.400}' } },
        metaModifiedText:  { value: { base: '{colors.secondary.800}', _dark: '{colors.secondary.200}' } },
        metaSavedBg:       { value: { base: '{colors.primary.100}', _dark: '{colors.primary.800}' } },
        metaSavedLine:     { value: { base: '{colors.primary.300}', _dark: '{colors.primary.400}' } },
        metaSavedText:     { value: { base: '{colors.primary.700}', _dark: '{colors.primary.200}' } },
      },
    },
    keyframes: {
      cardRise: {
        from: { opacity: '0', transform: 'translateY(8px)' },
        to: { opacity: '1', transform: 'translateY(0)' },
      },
      // Solve ripple: a raised keycap drops and flattens (ADR-0072 solve motion).
      wsFlatten: {
        '0%': { transform: 'translateY(-3px)', boxShadow: '0 3px 0 0 #D6CAA4, 0 6px 9px -3px rgba(33,75,64,0.2)' },
        '55%': { transform: 'translateY(1px)', boxShadow: 'inset 0 1px 3px rgba(33,75,64,0.16), inset 0 0 0 1px rgba(33,75,64,0.07)' },
        '100%': { transform: 'translateY(0)', boxShadow: 'inset 0 1px 3px rgba(33,75,64,0.16), inset 0 0 0 1px rgba(33,75,64,0.07)' },
      },
      // Sakura halo around a freshly-solved word before advancing.
      wsSolveGlow: {
        '0%': { boxShadow: '0 0 0 0 rgba(212,93,131,0)' },
        '35%': { boxShadow: '0 0 0 3px rgba(212,93,131,0.55), 0 0 14px 3px rgba(212,93,131,0.45)' },
        '100%': { boxShadow: '0 0 0 0 rgba(212,93,131,0)' },
      },
      // Jade breathing ring; animates outline so it never clobbers the cell's state ring.
      wsValidating: {
        '0%, 100%': { outlineColor: 'rgba(79,110,92,0.06)' },
        '50%': { outlineColor: 'rgba(79,110,92,0.5)' },
      },
      // Head-shake on a completed-but-wrong word.
      wsShake: {
        '0%, 100%': { transform: 'rotate(0deg)' },
        '25%': { transform: 'rotate(-3deg)' },
        '50%': { transform: 'rotate(3deg)' },
        '75%': { transform: 'rotate(-2deg)' },
      },
      // Win celebration (Phase 3): screen fade, drifting sakura petals, blossom pulse.
      wsFade: { from: { opacity: '0' }, to: { opacity: '1' } },
      wsFadeOut: { from: { opacity: '1' }, to: { opacity: '0' } },
      wsSpin: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
      wsPetalFall: {
        '0%': { transform: 'translateY(0) translateX(0) rotate(0deg)' },
        '50%': { transform: 'translateY(460px) translateX(18px) rotate(180deg)' },
        '100%': { transform: 'translateY(900px) translateX(-12px) rotate(374deg)' },
      },
      wsBloomGlow: {
        '0%, 100%': { transform: 'scale(1)' },
        '50%': { transform: 'scale(1.05)' },
      },
      // Settings bottom sheet entrance: rises from the bottom edge.
      wsSheetUp: {
        from: { transform: 'translateY(100%)' },
        to: { transform: 'translateY(0)' },
      },
      // Bottom sheet exit: slides back down to the bottom edge (mirror of wsSheetUp).
      wsSheetDown: {
        from: { transform: 'translateY(0)', opacity: '1' },
        to: { transform: 'translateY(100%)', opacity: '0' },
      },
      wsShimmer: {
        '0%': { transform: 'translateX(-100%)' },
        '100%': { transform: 'translateX(100%)' },
      },
      // Typing-presence dot: a soft opacity pulse while a peer is typing.
      wsPulse: {
        '0%, 100%': { opacity: '1' },
        '50%': { opacity: '0.4' },
      },
    },
  },
});
