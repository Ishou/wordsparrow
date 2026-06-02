// MSW survey-api handlers (ADR-0056), preview-mode only; host-agnostic glob, tree-shaken from prod.

import { http, HttpResponse } from 'msw';

const items = [
  {
    itemId: '0190e3a4-7a2c-7c9e-8f1a-000000000001',
    mot: 'AUTOMNE',
    definition: "Elle précède l'hiver",
    pos: 'nom_commun',
    categorie: 'meteo',
    style: 'cryptique',
    forceClaimed: 3,
    longueur: 7,
    tier: 'mid',
    isCalibration: false,
  },
  {
    itemId: '0190e3a4-7a2c-7c9e-8f1a-000000000002',
    mot: 'SOURIS',
    definition: "Petit rongeur, ou compagne du clavier",
    pos: 'nom_commun',
    categorie: 'faune_flore',
    style: 'calembour',
    forceClaimed: 2,
    longueur: 6,
    tier: 'mid',
    isCalibration: false,
  },
  {
    itemId: '0190e3a4-7a2c-7c9e-8f1a-000000000003',
    mot: 'HIBOU',
    definition: "Rapace nocturne aux yeux ronds",
    pos: 'nom_commun',
    categorie: 'faune_flore',
    style: 'definition_directe',
    forceClaimed: 1,
    longueur: 5,
    tier: 'easy',
    isCalibration: false,
  },
];

const ratedIds = new Set<string>();

const campaign = {
  campaignId: '0190e3a4-7a2c-7c9e-8f1a-00000000000a',
  batchLabel: 'round-10',
  openedAt: '2026-06-01T10:00:00Z',
  closedAt: null,
};

const whoami = {
  userId: '0190e3a4-7a2c-7c9e-8f1a-bbbbbbbbbbbb',
  displayName: 'Moineau 1',
};

const me = {
  id: whoami.userId,
  displayName: whoami.displayName,
  createdAt: '2026-05-01T10:00:00Z',
  providers: [],
};

export const surveyApiHandlers = [
  // Identity-api endpoints the /contribuer auth gate reads (same `*` glob).
  http.get('*/v1/auth/whoami', () => HttpResponse.json(whoami)),
  http.get('*/v1/users/me', () => HttpResponse.json(me)),
  http.get('*/v1/campaign/current', () => HttpResponse.json(campaign)),
  http.get('*/v1/me/progress', () =>
    HttpResponse.json({ itemsRated: 0, calibrationAgreement: null, lastRatedAt: null })),
  http.get('*/v1/me/contributions', () => HttpResponse.json([])),
  http.get('*/v1/lemma-meta/:mot', () =>
    HttpResponse.json({ priorSenses: [], priorSubTags: [] })),
  http.get('*/v1/items/pairs/next', () => new HttpResponse(null, { status: 204 })),
  http.get('*/v1/items/next', ({ request }) => {
    const excluded = new URL(request.url).searchParams.get('excluded')?.split(',') ?? [];
    // authed callers omit rated ids from query params; server (and mock) deduplicate
    const next = items.find((it) => !excluded.includes(it.itemId) && !ratedIds.has(it.itemId));
    if (!next) return new HttpResponse(null, { status: 204 });
    return HttpResponse.json(next);
  }),
  http.post('*/v1/items/:itemId/rating', ({ params }) => {
    const itemId = String(params.itemId);
    ratedIds.add(itemId);
    return HttpResponse.json({
      ratingId: '0190e3a4-7a2c-7c9e-8f1a-aaaaaaaaaaaa',
      itemId,
      submittedAs: 'auth',
      proposedItemId: null,
      undoToken: null,
    }, { status: 201 });
  }),
];
