import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import {
  AlreadyRatedError,
  createHttpSurveyClient,
  SignInRequiredError,
  UndoExpiredError,
  UndoUnavailableError,
} from '@/infrastructure';
import { ContribuerForbiddenError, ReportRateLimitedError } from '@/application/survey';

const BASE = 'http://survey.test';
const client = createHttpSurveyClient({ baseUrl: BASE });

const itemId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

const sampleItem = {
  itemId,
  mot: 'CHAT',
  definition: 'Felin domestique',
  pos: 'nom_commun',
  categorie: 'faune_flore',
  style: 'definition_directe',
  forceClaimed: 2,
  longueur: 4,
  tier: 'mid',
  isCalibration: false,
} as const;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('HttpSurveyClient.getNextItem', () => {
  it('returns the item on 200', async () => {
    server.use(http.get(`${BASE}/v1/items/next`, () => HttpResponse.json(sampleItem)));
    const result = await client.getNextItem();
    expect(result).toEqual(sampleItem);
  });

  it('returns null on 204', async () => {
    server.use(http.get(`${BASE}/v1/items/next`, () => new HttpResponse(null, { status: 204 })));
    const result = await client.getNextItem();
    expect(result).toBeNull();
  });

  it('passes excludedItemIds as a comma-separated `excluded` query', async () => {
    let captured = '';
    server.use(
      http.get(`${BASE}/v1/items/next`, ({ request }) => {
        captured = new URL(request.url).searchParams.get('excluded') ?? '';
        return HttpResponse.json(sampleItem);
      }),
    );
    await client.getNextItem({ excludedItemIds: ['a', 'b', 'c'] });
    expect(captured).toBe('a,b,c');
  });

  it('omits the query when excludedItemIds is empty', async () => {
    let hadParam = false;
    server.use(
      http.get(`${BASE}/v1/items/next`, ({ request }) => {
        hadParam = new URL(request.url).searchParams.has('excluded');
        return HttpResponse.json(sampleItem);
      }),
    );
    await client.getNextItem({ excludedItemIds: [] });
    expect(hadParam).toBe(false);
  });
});

describe('HttpSurveyClient.submitRating', () => {
  it('POSTs the rating and returns the envelope on 201', async () => {
    const envelope = {
      ratingId: '0190e3a4-7a2c-7c9e-8f1a-1234567890ab',
      itemId,
      submittedAs: 'anon' as const,
      proposedItemId: null,
    };
    server.use(
      http.post(`${BASE}/v1/items/${itemId}/rating`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.qualite).toBe(4);
        expect(body.latencyMs).toBeGreaterThanOrEqual(0);
        expect(body.isMultisense).toBe(true);
        expect(body.targetCategories).toEqual(['faune_flore']);
        expect(body.targetSense).toBe('animal félin');
        expect(body.subTags).toEqual(['félin']);
        return HttpResponse.json(envelope, { status: 201 });
      }),
    );
    const result = await client.submitRating(itemId, {
      qualite: 4,
      difficulte: 3,
      latencyMs: 1500,
      isMultisense: true,
      targetCategories: ['faune_flore'],
      targetSense: 'animal félin',
      subTags: ['félin'],
    });
    expect(result).toEqual(envelope);
  });

  it('throws SignInRequiredError on 401', async () => {
    server.use(
      http.post(`${BASE}/v1/items/${itemId}/rating`, () =>
        HttpResponse.json({ type: 'about:blank', title: 'Unauthorized', status: 401 }, { status: 401 }),
      ),
    );
    await expect(
      client.submitRating(itemId, { qualite: 4, difficulte: 3, latencyMs: 0, isMultisense: false }),
    ).rejects.toBeInstanceOf(SignInRequiredError);
  });

  it('throws CorrectifRejectedError carrying the filter detail on 422', async () => {
    const rejection = {
      type: 'https://wordsparrow.io/errors/filter-violation',
      title: 'Correctif rejected',
      status: 422,
      filterId: 3,
      reason: 'auto-référence détectée',
    };
    server.use(
      http.post(`${BASE}/v1/items/${itemId}/rating`, () =>
        HttpResponse.json(rejection, {
          status: 422,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
    );
    await expect(
      client.submitRating(itemId, {
        qualite: 4,
        difficulte: 3,
        correctif: { text: 'meilleure définition', style: 'definition_directe' },
        latencyMs: 1000,
        isMultisense: false,
      }),
    ).rejects.toMatchObject({ name: 'CorrectifRejectedError', detail: rejection });
  });

  it('throws AlreadyRatedError carrying the existing envelope on 409', async () => {
    const existing = {
      ratingId: '0190e3a4-7a2c-7c9e-8f1a-aaaaaaaaaaaa',
      itemId,
      submittedAs: 'auth' as const,
      proposedItemId: null,
    };
    server.use(
      http.post(`${BASE}/v1/items/${itemId}/rating`, () =>
        HttpResponse.json(existing, { status: 409 }),
      ),
    );
    try {
      await client.submitRating(itemId, { qualite: 1, difficulte: 1, latencyMs: 0, isMultisense: false });
      expect.unreachable('expected AlreadyRatedError');
    } catch (err) {
      expect(err).toBeInstanceOf(AlreadyRatedError);
      expect((err as AlreadyRatedError).response).toEqual(existing);
    }
  });
});

describe('HttpSurveyClient.getProgress', () => {
  it('returns the progress snapshot on 200', async () => {
    const snapshot = {
      itemsRated: 12,
      calibrationAgreement: 0.8,
      lastRatedAt: '2026-05-25T10:00:00Z',
    };
    server.use(http.get(`${BASE}/v1/me/progress`, () => HttpResponse.json(snapshot)));
    expect(await client.getProgress()).toEqual(snapshot);
  });

  it('throws SignInRequiredError on 401', async () => {
    server.use(http.get(`${BASE}/v1/me/progress`, () => new HttpResponse(null, { status: 401 })));
    await expect(client.getProgress()).rejects.toBeInstanceOf(SignInRequiredError);
  });
});

describe('HttpSurveyClient.getContributions', () => {
  it('returns the list on 200', async () => {
    const list = [
      {
        itemId,
        mot: 'CHIEN',
        definition: 'Meilleur ami de l\'homme',
        pos: 'nom_commun',
        categorie: 'faune_flore',
        style: 'definition_directe',
        optedOut: false,
        kCoverage: 5,
        createdAt: '2026-05-01T08:00:00Z',
      },
    ];
    server.use(http.get(`${BASE}/v1/me/contributions`, () => HttpResponse.json(list)));
    expect(await client.getContributions()).toEqual(list);
  });

  it('throws SignInRequiredError on 401', async () => {
    server.use(
      http.get(`${BASE}/v1/me/contributions`, () => new HttpResponse(null, { status: 401 })),
    );
    await expect(client.getContributions()).rejects.toBeInstanceOf(SignInRequiredError);
  });
});

describe('HttpSurveyClient.getNextPair', () => {
  const samplePair = {
    mot: 'CHAT',
    left: sampleItem,
    right: { ...sampleItem, itemId: '0190e3a4-7a2c-7c9e-8f1a-cafecafecafe' },
  };

  it('returns the pair on 200', async () => {
    server.use(http.get(`${BASE}/v1/items/pairs/next`, () => HttpResponse.json(samplePair)));
    expect(await client.getNextPair()).toEqual(samplePair);
  });

  it('returns null on 204', async () => {
    server.use(
      http.get(`${BASE}/v1/items/pairs/next`, () => new HttpResponse(null, { status: 204 })),
    );
    expect(await client.getNextPair()).toBeNull();
  });

  it('passes excludedItemIds as a comma-separated `excluded` query', async () => {
    let captured = '';
    server.use(
      http.get(`${BASE}/v1/items/pairs/next`, ({ request }) => {
        captured = new URL(request.url).searchParams.get('excluded') ?? '';
        return HttpResponse.json(samplePair);
      }),
    );
    await client.getNextPair({ excludedItemIds: ['a', 'b'] });
    expect(captured).toBe('a,b');
  });
});

describe('HttpSurveyClient.submitPairRating', () => {
  const leftId = '0190e3a4-7a2c-7c9e-8f1a-1111111111aa';
  const rightId = '0190e3a4-7a2c-7c9e-8f1a-2222222222bb';

  it('POSTs the payload and resolves with the token on 201', async () => {
    let captured: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/v1/ratings/pair`, async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ undoToken: 'tok_left' }, { status: 201 });
      }),
    );
    const result = await client.submitPairRating({
      leftItemId: leftId,
      rightItemId: rightId,
      verdict: 'LEFT_WINS',
      difficulte: 3,
      latencyMs: 1500,
    });
    expect(result).toEqual({ undoToken: 'tok_left' });
    expect(captured).toEqual({
      leftItemId: leftId,
      rightItemId: rightId,
      verdict: 'LEFT_WINS',
      difficulte: 3,
      latencyMs: 1500,
    });
  });

  it('throws SignInRequiredError on 401', async () => {
    server.use(
      http.post(`${BASE}/v1/ratings/pair`, () => new HttpResponse(null, { status: 401 })),
    );
    await expect(
      client.submitPairRating({
        leftItemId: leftId,
        rightItemId: rightId,
        verdict: 'LEFT_WINS',
        difficulte: 3,
        latencyMs: 0,
      }),
    ).rejects.toBeInstanceOf(SignInRequiredError);
  });

  it('throws AlreadyRatedError on 409', async () => {
    server.use(
      http.post(`${BASE}/v1/ratings/pair`, () => new HttpResponse(null, { status: 409 })),
    );
    await expect(
      client.submitPairRating({
        leftItemId: leftId,
        rightItemId: rightId,
        verdict: 'BOTH_GOOD',
        difficulte: 3,
        latencyMs: 0,
      }),
    ).rejects.toBeInstanceOf(AlreadyRatedError);
  });

  it('returns the undoToken from the response envelope', async () => {
    server.use(
      http.post(`${BASE}/v1/ratings/pair`, () =>
        HttpResponse.json({ undoToken: 'tok_pair' }),
      ),
    );
    const result = await client.submitPairRating({
      leftItemId: leftId,
      rightItemId: rightId,
      verdict: 'BOTH_GOOD',
      difficulte: 3,
      latencyMs: 100,
    });
    expect(result).toEqual({ undoToken: 'tok_pair' });
  });

  it('resolves with a null token on 204 (SKIP)', async () => {
    server.use(
      http.post(`${BASE}/v1/ratings/pair`, () => new HttpResponse(null, { status: 204 })),
    );
    const result = await client.submitPairRating({
      leftItemId: leftId,
      rightItemId: rightId,
      verdict: 'SKIP',
      difficulte: 3,
      latencyMs: 0,
    });
    expect(result).toEqual({ undoToken: null });
  });
});

describe('HttpSurveyClient.undoAction', () => {
  it('resolves on 204', async () => {
    let body: unknown = null;
    server.use(
      http.post(`${BASE}/v1/actions/undo`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(client.undoAction('tok_abc')).resolves.toBeUndefined();
    expect(body).toEqual({ token: 'tok_abc' });
  });

  it('throws UndoUnavailableError on 404', async () => {
    server.use(
      http.post(`${BASE}/v1/actions/undo`, () => new HttpResponse(null, { status: 404 })),
    );
    await expect(client.undoAction('tok_abc')).rejects.toBeInstanceOf(UndoUnavailableError);
  });

  it('throws UndoExpiredError on 410', async () => {
    server.use(
      http.post(`${BASE}/v1/actions/undo`, () => new HttpResponse(null, { status: 410 })),
    );
    await expect(client.undoAction('tok_abc')).rejects.toBeInstanceOf(UndoExpiredError);
  });
});

describe('HttpSurveyClient.patchPreferences', () => {
  it('PATCHes and resolves on 204', async () => {
    let captured: { deleteProposedOnErasure?: boolean } = {};
    server.use(
      http.patch(`${BASE}/v1/me/preferences`, async ({ request }) => {
        captured = (await request.json()) as { deleteProposedOnErasure: boolean };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await client.patchPreferences({ deleteProposedOnErasure: true });
    expect(captured).toEqual({ deleteProposedOnErasure: true });
  });

  it('throws SignInRequiredError on 401', async () => {
    server.use(
      http.patch(`${BASE}/v1/me/preferences`, () => new HttpResponse(null, { status: 401 })),
    );
    await expect(
      client.patchPreferences({ deleteProposedOnErasure: false }),
    ).rejects.toBeInstanceOf(SignInRequiredError);
  });
});

describe('HttpSurveyClient.getLemmaMeta', () => {
  it('GETs and returns the LemmaMeta payload', async () => {
    server.use(
      http.get(`${BASE}/v1/lemma-meta/CHAT`, () =>
        HttpResponse.json({ priorSenses: ['félin'], priorSubTags: ['domestique'] }),
      ),
    );
    const meta = await client.getLemmaMeta('CHAT');
    expect(meta).toEqual({ priorSenses: ['félin'], priorSubTags: ['domestique'] });
  });
});

describe('HttpSurveyClient.submitSignalement', () => {
  // Injectable fetch (createHttpSurveyClient's `fetch` option) so the request init
  // — credentials, headers, body omission — can be asserted directly.
  function spyFetch(status: number, body?: unknown) {
    return vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }

  const call = (fetchImpl: ReturnType<typeof spyFetch>) =>
    createHttpSurveyClient({ baseUrl: BASE, fetch: fetchImpl as unknown as typeof fetch });

  it('POSTs to /v1/signalements with credentials + JSON, never sends wordText, returns reportId on 201', async () => {
    const fetchImpl = spyFetch(201, { reportId: 'rep-1' });
    const result = await call(fetchImpl).submitSignalement({
      clueText: 'félin domestique',
      reason: 'erreur_sens',
      surface: 'solo',
    });

    expect(result).toEqual({ reportId: 'rep-1' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/v1/signalements`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent).toEqual({
      clueText: 'félin domestique',
      reason: 'erreur_sens',
      surface: 'solo',
    });
    expect(sent).not.toHaveProperty('wordText');
    expect(sent).not.toHaveProperty('note');
    expect(sent).not.toHaveProperty('puzzleId');
  });

  it('includes note + puzzleId when provided, still without wordText', async () => {
    const fetchImpl = spyFetch(201, { reportId: 'rep-2' });
    await call(fetchImpl).submitSignalement({
      clueText: 'félin domestique',
      reason: 'autre',
      surface: 'daily',
      note: 'contre-sens',
      puzzleId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
    });
    const [, init] = fetchImpl.mock.calls[0];
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent.note).toBe('contre-sens');
    expect(sent.puzzleId).toBe('0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b');
    expect(sent).not.toHaveProperty('wordText');
  });

  it('throws ReportRateLimitedError on 429 (checked before the generic non-ok throw)', async () => {
    const fetchImpl = spyFetch(429, { type: 'about:blank', title: 'Too Many Requests', status: 429 });
    await expect(
      call(fetchImpl).submitSignalement({ clueText: 'félin', reason: 'autre', surface: 'solo' }),
    ).rejects.toBeInstanceOf(ReportRateLimitedError);
  });

  it('throws a generic Error on other non-ok statuses (500)', async () => {
    const fetchImpl = spyFetch(500);
    const promise = call(fetchImpl).submitSignalement({
      clueText: 'félin',
      reason: 'autre',
      surface: 'solo',
    });
    await expect(promise).rejects.toThrow(/submitSignalement failed: 500/);
    await expect(promise).rejects.not.toBeInstanceOf(ReportRateLimitedError);
  });
});

describe('HttpSurveyClient.listSignalements', () => {
  const summary = {
    reportId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
    wordText: 'CHAT',
    clueText: 'Animal qui miaule',
    reason: 'erreur_sens' as const,
    surface: 'daily' as const,
    puzzleId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
    count: 3,
    latestNote: 'contre-sens',
    latestAt: '2026-07-11T10:00:00Z',
    mine: false,
  };

  it('GETs /v1/signalements with credentials and returns the items array on 200', async () => {
    let credentials: RequestCredentials | undefined;
    server.use(
      http.get(`${BASE}/v1/signalements`, ({ request }) => {
        credentials = request.credentials;
        return HttpResponse.json({ items: [summary] });
      }),
    );
    const result = await client.listSignalements();
    expect(result).toEqual([summary]);
    expect(credentials).toBe('include');
  });

  it('throws ContribuerForbiddenError on 403', async () => {
    server.use(http.get(`${BASE}/v1/signalements`, () => new HttpResponse(null, { status: 403 })));
    await expect(client.listSignalements()).rejects.toBeInstanceOf(ContribuerForbiddenError);
  });

  it('throws a generic Error on other non-ok statuses', async () => {
    server.use(http.get(`${BASE}/v1/signalements`, () => new HttpResponse(null, { status: 500 })));
    await expect(client.listSignalements()).rejects.toThrow(/listSignalements failed: 500/);
  });
});

describe('HttpSurveyClient.listHandledSignalements', () => {
  const item = {
    reportId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
    wordText: 'CHAT',
    clueText: 'Animal qui miaule',
    reason: 'erreur_sens' as const,
    surface: 'daily' as const,
    puzzleId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
    note: 'contre-sens',
    decision: 'action' as const,
    triagedAt: '2026-07-11T12:00:00Z',
  };

  it('GETs /v1/signalements/historique with credentials and returns the items array on 200', async () => {
    let credentials: RequestCredentials | undefined;
    server.use(
      http.get(`${BASE}/v1/signalements/historique`, ({ request }) => {
        credentials = request.credentials;
        return HttpResponse.json({ items: [item] });
      }),
    );
    const result = await client.listHandledSignalements();
    expect(result).toEqual([item]);
    expect(credentials).toBe('include');
  });

  it('throws ContribuerForbiddenError on 403', async () => {
    server.use(http.get(`${BASE}/v1/signalements/historique`, () => new HttpResponse(null, { status: 403 })));
    await expect(client.listHandledSignalements()).rejects.toBeInstanceOf(ContribuerForbiddenError);
  });

  it('throws a generic Error on other non-ok statuses', async () => {
    server.use(http.get(`${BASE}/v1/signalements/historique`, () => new HttpResponse(null, { status: 500 })));
    await expect(client.listHandledSignalements()).rejects.toThrow(/listHandledSignalements failed: 500/);
  });
});

describe('HttpSurveyClient.decideSignalement', () => {
  const reportId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

  it('POSTs the decision to /v1/signalements/{id}/decision and resolves on 204', async () => {
    let captured: Record<string, unknown> = {};
    let method = '';
    server.use(
      http.post(`${BASE}/v1/signalements/${reportId}/decision`, async ({ request }) => {
        method = request.method;
        captured = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(client.decideSignalement(reportId, 'action')).resolves.toBeUndefined();
    expect(method).toBe('POST');
    expect(captured).toEqual({ decision: 'action' });
  });

  it('throws ContribuerForbiddenError on 403', async () => {
    server.use(
      http.post(`${BASE}/v1/signalements/${reportId}/decision`, () => new HttpResponse(null, { status: 403 })),
    );
    await expect(client.decideSignalement(reportId, 'dismiss')).rejects.toBeInstanceOf(ContribuerForbiddenError);
  });

  it('throws a generic Error on 404', async () => {
    server.use(
      http.post(`${BASE}/v1/signalements/${reportId}/decision`, () => new HttpResponse(null, { status: 404 })),
    );
    await expect(client.decideSignalement(reportId, 'dismiss')).rejects.toThrow(/decideSignalement failed: 404/);
  });
});
