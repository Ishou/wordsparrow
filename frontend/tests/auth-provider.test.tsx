import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import { AuthProvider, useAuth } from '@/ui/components/auth';

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

interface FakeAuthClient extends AuthClient {
  readonly _calls: {
    whoami: number;
    updateMe: string[];
  };
}

function fakeAuthClient(opts: {
  whoamiSeq: ReadonlyArray<WhoAmIResult | null | Error>;
  updateMeImpl?: (n: string) => Promise<void>;
}): FakeAuthClient {
  let i = 0;
  const calls = { whoami: 0, updateMe: [] as string[] };
  return {
    _calls: calls,
    async whoami() {
      calls.whoami += 1;
      const next = opts.whoamiSeq[Math.min(i, opts.whoamiSeq.length - 1)];
      i += 1;
      if (next instanceof Error) throw next;
      return next;
    },
    async getMe() { throw new Error('not used'); },
    async updateMe(n: string) {
      calls.updateMe.push(n);
      if (opts.updateMeImpl) return opts.updateMeImpl(n);
    },
    async deleteMe() {},
    async logout() {},
    async logoutAll() {},
    async startEmailOtp() { return 'sent' as const; },
    async verifyEmailOtp() { return 'ok' as const; },
    signInUrl(provider, returnTo) {
      return `https://auth.test/v1/auth/${provider}/login?return_to=${encodeURIComponent(returnTo)}`;
    },
  };
}

function Probe() {
  const { state } = useAuth();
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      {state.status === 'authed' ? (
        <span data-testid="display">{state.whoami.displayName}</span>
      ) : null}
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders status=anon when whoami returns null', async () => {
    const client = fakeAuthClient({ whoamiSeq: [null] });
    render(
      <AuthProvider authClient={client} getPseudonym={() => 'Renard 423'}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anon'));
  });

  it('renders status=authed when whoami returns a user', async () => {
    const client = fakeAuthClient({
      whoamiSeq: [{ userId: USER_ID, displayName: 'Lapin 472' }],
    });
    render(
      <AuthProvider authClient={client} getPseudonym={() => 'Renard 423'}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authed'));
    expect(screen.getByTestId('display').textContent).toBe('Lapin 472');
  });

  it('treats network errors as anon', async () => {
    const client = fakeAuthClient({ whoamiSeq: [new Error('fetch failed')] });
    render(
      <AuthProvider authClient={client} getPseudonym={() => 'Renard 423'}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anon'));
  });

  it('carries the anon pseudonym over on first sign-in when displayName=Joueur and local is a default', async () => {
    const client = fakeAuthClient({
      whoamiSeq: [
        { userId: USER_ID, displayName: 'Joueur' },
        { userId: USER_ID, displayName: 'Renard 423' },
      ],
    });
    render(
      <AuthProvider authClient={client} getPseudonym={() => 'Renard 423'}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('display')?.textContent).toBe('Renard 423'));
    expect(client._calls.updateMe).toEqual(['Renard 423']);
  });

  it('does not carry over when the local pseudonym is custom', async () => {
    const client = fakeAuthClient({
      whoamiSeq: [{ userId: USER_ID, displayName: 'Joueur' }],
    });
    render(
      <AuthProvider authClient={client} getPseudonym={() => 'MonNom'}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('display')?.textContent).toBe('Joueur'));
    expect(client._calls.updateMe).toEqual([]);
  });

  it('only attempts the carry-over PATCH once across multiple refreshes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-03T10:00:00Z'));
    const client = fakeAuthClient({
      whoamiSeq: [
        { userId: USER_ID, displayName: 'Joueur' },
        { userId: USER_ID, displayName: 'Renard 423' },
        { userId: USER_ID, displayName: 'Renard 423' },
      ],
    });
    render(
      <AuthProvider authClient={client} getPseudonym={() => 'Renard 423'}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('display')?.textContent).toBe('Renard 423'));
    // Simulate a stale tab-focus visibility change — should re-check but never re-PATCH.
    vi.setSystemTime(new Date('2026-07-03T10:05:00Z'));
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(client._calls.whoami).toBeGreaterThanOrEqual(3));
    expect(client._calls.updateMe).toEqual(['Renard 423']);
  });

  describe('whoami staleness gate on tab focus', () => {
    const T0 = new Date('2026-07-03T10:00:00Z');
    const FIVE_MINUTES_MS = 5 * 60_000;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(T0);
    });

    function renderAnonProvider() {
      const client = fakeAuthClient({ whoamiSeq: [null] });
      render(
        <AuthProvider authClient={client} getPseudonym={() => 'Renard 423'}>
          <Probe />
        </AuthProvider>,
      );
      return client;
    }

    it('calls whoami exactly once on mount', async () => {
      const client = renderAnonProvider();
      await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anon'));
      expect(client._calls.whoami).toBe(1);
    });

    it('skips the refetch when the tab regains focus within 5 minutes', async () => {
      const client = renderAnonProvider();
      await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anon'));
      vi.setSystemTime(new Date(T0.getTime() + FIVE_MINUTES_MS - 1));
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(client._calls.whoami).toBe(1);
    });

    it('refetches exactly once when the tab regains focus after 5 minutes', async () => {
      const client = renderAnonProvider();
      await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anon'));
      vi.setSystemTime(new Date(T0.getTime() + FIVE_MINUTES_MS));
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(client._calls.whoami).toBe(2);
    });

    it('updates the staleness window on a failed (anon) resolution too', async () => {
      const client = fakeAuthClient({ whoamiSeq: [new Error('fetch failed')] });
      render(
        <AuthProvider authClient={client} getPseudonym={() => 'Renard 423'}>
          <Probe />
        </AuthProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anon'));
      vi.setSystemTime(new Date(T0.getTime() + FIVE_MINUTES_MS - 1));
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(client._calls.whoami).toBe(1);
    });
  });

  it('settles authed even when the carry-over PATCH fails', async () => {
    const client = fakeAuthClient({
      whoamiSeq: [{ userId: USER_ID, displayName: 'Joueur' }],
      updateMeImpl: async () => { throw new Error('400'); },
    });
    render(
      <AuthProvider authClient={client} getPseudonym={() => 'Renard 423'}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('display')?.textContent).toBe('Joueur'));
  });

  it('useAuth throws when used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/useAuth must be used inside/);
    spy.mockRestore();
  });
});
