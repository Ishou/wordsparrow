import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { createGridCorrectionClient } from '@/infrastructure';

const BASE = 'http://grid.test';
const client = createGridCorrectionClient({ baseUrl: BASE });

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('GridCorrectionClient.reverseCorrection', () => {
  it('POSTs oldClueText + wordText and returns the reversed kind', async () => {
    let captured: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/v1/corrections/reverse`, async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ reversedKind: 'forbid_clue' });
      }),
    );

    await expect(client.reverseCorrection('Animal qui miaule', 'CHAT')).resolves.toBe('forbid_clue');
    expect(captured).toEqual({ oldClueText: 'Animal qui miaule', wordText: 'CHAT' });
  });

  it('omits wordText when not provided and tolerates a null reversedKind', async () => {
    let captured: Record<string, unknown> = {};
    server.use(
      http.post(`${BASE}/v1/corrections/reverse`, async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ reversedKind: null });
      }),
    );

    await expect(client.reverseCorrection('Animal qui miaule')).resolves.toBeNull();
    expect(captured).toEqual({ oldClueText: 'Animal qui miaule' });
  });

  it('throws when the response carries no body', async () => {
    server.use(
      http.post(`${BASE}/v1/corrections/reverse`, () => new HttpResponse(null, { status: 500 })),
    );

    await expect(client.reverseCorrection('Animal qui miaule', 'CHAT')).rejects.toThrow(/reverseCorrection failed: 500/);
  });
});
