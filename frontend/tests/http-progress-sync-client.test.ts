import { describe, expect, it } from 'vitest';
import { createHttpProgressSyncClient } from '@/infrastructure/api/identity/HttpProgressSyncClient';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpProgressSyncClient.push keepalive forwarding', () => {
  // openapi-fetch builds a Request and calls fetch(request), so keepalive lands on the Request, not a second init arg.
  const keepaliveOf = (input: RequestInfo | URL, init?: RequestInit): boolean | undefined =>
    input instanceof Request ? input.keepalive : init?.keepalive;

  it('forwards keepalive:true to fetch when requested (unload flush)', async () => {
    let seen: boolean | undefined;
    const fakeFetch: typeof globalThis.fetch = async (input, init) => {
      seen = keepaliveOf(input, init);
      return jsonResponse({ updatedAt: '2026-06-28T10:00:00.000Z' });
    };
    const client = createHttpProgressSyncClient({ baseUrl: 'https://auth.test', fetch: fakeFetch });

    await client.push('p1', { entries: [] }, undefined, { keepalive: true });

    expect(seen).toBe(true);
  });

  it('does not set keepalive on a normal push', async () => {
    let seen: boolean | undefined;
    const fakeFetch: typeof globalThis.fetch = async (input, init) => {
      seen = keepaliveOf(input, init);
      return jsonResponse({ updatedAt: '2026-06-28T10:00:00.000Z' });
    };
    const client = createHttpProgressSyncClient({ baseUrl: 'https://auth.test', fetch: fakeFetch });

    await client.push('p1', { entries: [] });

    expect(seen).toBeFalsy();
  });
});
