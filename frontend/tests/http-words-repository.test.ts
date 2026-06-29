import { describe, expect, it, vi } from 'vitest';
import { createHttpWordsRepository } from '@/infrastructure';

const json = (body: unknown, status = 200, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

describe('HttpWordsRepository — fetchSampleWords', () => {
  it('maps answerLength + token and never surfaces a plaintext answer', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      json([{ clue: 'Astre', answerLength: 4, token: 'tok-LUNE', answer: 'LUNE' }]),
    );
    const repo = createHttpWordsRepository({ baseUrl: 'https://api.example.test', fetch: fetchSpy });

    const words = await repo.fetchSampleWords({ minLen: 3, maxLen: 6, count: 8 });

    expect(words).toEqual([{ clue: 'Astre', answerLength: 4, token: 'tok-LUNE' }]);
    expect(words[0]).not.toHaveProperty('answer');
  });
});

describe('HttpWordsRepository — verifySample', () => {
  it('POSTs {token, guess} to /v1/words/sample/verify and returns correct', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(json({ correct: true }));
    const repo = createHttpWordsRepository({ baseUrl: 'https://api.example.test', fetch: fetchSpy });

    const ok = await repo.verifySample('tok-LUNE', 'LUNE');

    expect(ok).toBe(true);
    const call = fetchSpy.mock.calls[0][0];
    const url = call instanceof Request ? call.url : String(call);
    const init = call instanceof Request ? call : fetchSpy.mock.calls[0][1];
    expect(url).toBe('https://api.example.test/v1/words/sample/verify');
    expect((init as Request).method ?? init.method).toBe('POST');
    const body = await (init as Request).clone().text();
    expect(JSON.parse(body)).toEqual({ token: 'tok-LUNE', guess: 'LUNE' });
  });

  it('returns false when the server says not correct', async () => {
    const repo = createHttpWordsRepository({
      baseUrl: 'https://api.example.test',
      fetch: vi.fn().mockResolvedValue(json({ correct: false })),
    });
    expect(await repo.verifySample('tok-LUNE', 'XYZW')).toBe(false);
  });

  it('treats a non-200 response as not correct (surfaces nothing)', async () => {
    const repo = createHttpWordsRepository({
      baseUrl: 'https://api.example.test',
      fetch: vi.fn().mockResolvedValue(
        json(
          { type: 'about:blank', title: 'Bad Request', status: 400 },
          400,
          'application/problem+json',
        ),
      ),
    });
    expect(await repo.verifySample('', 'LUNE')).toBe(false);
  });

  it('does not send credentials (grid CORS omits ACA-Credentials on public endpoints)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(json({ correct: true }));
    const repo = createHttpWordsRepository({ baseUrl: 'https://api.example.test', fetch: fetchSpy });

    await repo.verifySample('tok-LUNE', 'LUNE');

    const call = fetchSpy.mock.calls[0][0];
    const init = call instanceof Request ? call : fetchSpy.mock.calls[0][1];
    expect((init as Request).credentials).not.toBe('include');
  });
});
