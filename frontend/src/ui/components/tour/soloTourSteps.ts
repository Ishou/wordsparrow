import { Tour } from '@ark-ui/react/tour';
import { t } from '@/ui/i18n';

// 6-step solo onboarding tour (5 on mobile — the zoom step is desktop-
// only because GridZoomControls is hidden via `display: { base: 'none',
// md: 'flex' }` and pinch-zoom on mobile is intuitive enough that we
// don't dedicate a step to teach it).
//
// Steps query the live DOM at activation time so the tour stays
// decoupled from the puzzle's rendered layout (no need to bake
// "tutorial cell" metadata into the domain `Puzzle` type).
//
// Step 3 reuses step 2's target on purpose: the spotlight points at
// the same definition cell while the description shifts focus to the
// arrow semantics. Per-arrow targeting can come as a follow-up if UX
// research asks for it.

const TOOLBAR_SELECTOR = '[role="toolbar"][aria-label="Outils de la grille"]';
const DEFINITION_CELL_SELECTOR = '[data-cell-kind="definition"]';
const HINT_BUTTON_SELECTOR = '[aria-label^="Indice ("]';
const ZOOM_CONTROLS_SELECTOR = '[role="group"][aria-label="Zoom controls"]';
const MINIMAP_SELECTOR = '[role="img"][aria-label^="Aperçu de la grille"]';

const queryFirst = (selector: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(selector);

export interface BuildStepsOptions {
  /** True when the viewport is desktop (≥ 768 px). Used to skip the
   * zoom step on mobile, where `GridZoomControls` is hidden. */
  readonly isDesktop: boolean;
}

const NEXT_PREV_ACTIONS: Tour.StepAction[] = [
  { label: t('tour.action.prev'), action: 'prev' },
  { label: t('tour.action.next'), action: 'next' },
];

export function buildSoloTourSteps({
  isDesktop,
}: BuildStepsOptions): Tour.StepDetails[] {
  const steps: Tour.StepDetails[] = [
    {
      id: 'welcome',
      type: 'dialog',
      title: t('tour.welcome.title'),
      description: t('tour.welcome.body'),
      placement: 'center',
      backdrop: true,
      actions: [{ label: t('tour.action.next'), action: 'next' }],
    },
    {
      id: 'clue-cells',
      type: 'tooltip',
      title: t('tour.clueCells.title'),
      description: t('tour.clueCells.body'),
      target: () => queryFirst(DEFINITION_CELL_SELECTOR),
      placement: 'bottom',
      arrow: true,
      backdrop: true,
      actions: NEXT_PREV_ACTIONS,
    },
    {
      id: 'arrows',
      type: 'tooltip',
      title: t('tour.arrows.title'),
      description: t('tour.arrows.body'),
      target: () => queryFirst(DEFINITION_CELL_SELECTOR),
      placement: 'bottom',
      arrow: true,
      backdrop: true,
      actions: NEXT_PREV_ACTIONS,
    },
    {
      id: 'hints',
      type: 'tooltip',
      title: t('tour.hints.title'),
      description: t('tour.hints.body'),
      target: () => queryFirst(HINT_BUTTON_SELECTOR),
      placement: 'bottom',
      arrow: true,
      backdrop: true,
      actions: NEXT_PREV_ACTIONS,
    },
  ];

  if (isDesktop) {
    steps.push({
      id: 'zoom',
      type: 'tooltip',
      title: t('tour.zoom.title'),
      description: t('tour.zoom.body'),
      target: () => queryFirst(ZOOM_CONTROLS_SELECTOR),
      placement: 'top',
      arrow: true,
      backdrop: true,
      actions: NEXT_PREV_ACTIONS,
    });
  }

  steps.push({
    id: 'validation',
    type: 'tooltip',
    title: t('tour.validation.title'),
    description: t('tour.validation.body'),
    target: () => queryFirst(MINIMAP_SELECTOR),
    placement: 'top',
    arrow: true,
    backdrop: true,
    actions: [
      { label: t('tour.action.prev'), action: 'prev' },
      { label: t('tour.action.finish'), action: 'dismiss' },
    ],
  });

  return steps;
}

// Selector exports kept for tests so they can sync targets with the
// rendered DOM without duplicating the strings.
export const TOUR_TARGET_SELECTORS = {
  toolbar: TOOLBAR_SELECTOR,
  definitionCell: DEFINITION_CELL_SELECTOR,
  hintButton: HINT_BUTTON_SELECTOR,
  zoomControls: ZOOM_CONTROLS_SELECTOR,
  minimap: MINIMAP_SELECTOR,
} as const;
