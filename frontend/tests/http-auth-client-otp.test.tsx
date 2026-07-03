import { describe, expect, it, vi } from 'vitest';

import { createHttpAuthClient } from '@/infrastructure';
import type { IdentityApiClient } from '@/infrastructure/api/identity/client';

// Contract test for the email-OTP AuthClient methods: assert path + `credentials:'include'`
// and the status→value mapping, driving a fake openapi-fetch client (the HTTP boundary).

const BASE_URL = 'https://auth.wordsparrow.example';

interface RecordedCall {
  readonly path: string;
  readonly init: Record<string, unknown>;
}

function fakePostClient(status: number, body?: unknown) {
  const calls: RecordedCall[] = [];
  const isError = status >= 400;
  const POST = vi.fn(async (path: string, init: Record<string, unknown>) => {
    calls.push({ path, init });
    return {
      data: isError ? undefined : body,
      error: isError ? body ?? { title: 'error', status } : undefined,
      response: { status } as Response,
    };
  });
  const client = { POST } as unknown as IdentityApiClient;
  return { client, calls };
}

const makeAuth = (status: number, body?: unknown) => {
  const { client, calls } = fakePostClient(status, body);
  return { auth: createHttpAuthClient({ baseUrl: BASE_URL, client }), calls };
};

describe('HttpAuthClient.startEmailOtp', () => {
  it('POSTs /v1/auth/email/start with credentials include and body, mapping 202 → sent', async () => {
    const { auth, calls } = makeAuth(202);

    const result = await auth.startEmailOtp('alice@example.com');

    expect(result).toBe('sent');
    expect(calls[0]?.path).toBe('/v1/auth/email/start');
    expect(calls[0]?.init.credentials).toBe('include');
    expect(calls[0]?.init.body).toEqual({ email: 'alice@example.com' });
  });

  it('maps 429 → rate_limited', async () => {
    const { auth } = makeAuth(429);
    expect(await auth.startEmailOtp('alice@example.com')).toBe('rate_limited');
  });

  it('maps 400 → invalid', async () => {
    const { auth } = makeAuth(400);
    expect(await auth.startEmailOtp('nope')).toBe('invalid');
  });

  it('throws on 502 (send failure is exceptional)', async () => {
    const { auth } = makeAuth(502, { title: 'send failed', status: 502 });
    await expect(auth.startEmailOtp('alice@example.com')).rejects.toThrow(/startEmailOtp failed/);
  });
});

describe('HttpAuthClient.verifyEmailOtp', () => {
  it('POSTs /v1/auth/email/verify with credentials include and body, mapping 200 → ok', async () => {
    const { auth, calls } = makeAuth(200, {
      userId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
      displayName: 'Lapin 472',
    });

    const result = await auth.verifyEmailOtp('alice@example.com', '012345');

    expect(result).toBe('ok');
    expect(calls[0]?.path).toBe('/v1/auth/email/verify');
    expect(calls[0]?.init.credentials).toBe('include');
    expect(calls[0]?.init.body).toEqual({ email: 'alice@example.com', code: '012345' });
  });

  it('maps 401 → invalid', async () => {
    const { auth } = makeAuth(401);
    expect(await auth.verifyEmailOtp('alice@example.com', '000000')).toBe('invalid');
  });

  it('maps 400 → invalid (uniform non-enumerating failure)', async () => {
    const { auth } = makeAuth(400);
    expect(await auth.verifyEmailOtp('alice@example.com', 'nope')).toBe('invalid');
  });
});

describe('HttpAuthClient.logoutAll', () => {
  it('POSTs /v1/auth/logout-all with credentials include and resolves on 204', async () => {
    const { auth, calls } = makeAuth(204);

    await expect(auth.logoutAll()).resolves.toBeUndefined();
    expect(calls[0]?.path).toBe('/v1/auth/logout-all');
    expect(calls[0]?.init.credentials).toBe('include');
  });

  it('resolves on 401 (already signed out)', async () => {
    const { auth } = makeAuth(401);
    await expect(auth.logoutAll()).resolves.toBeUndefined();
  });

  it('throws on 500', async () => {
    const { auth } = makeAuth(500, { title: 'boom', status: 500 });
    await expect(auth.logoutAll()).rejects.toThrow(/logoutAll failed/);
  });
});
