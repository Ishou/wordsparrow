import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import { AuthProvider } from '@/ui/components/auth';
import { useCapability, useRole } from '@/ui/components/billing';

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

function fakeAuthClient(whoami: WhoAmIResult | null): AuthClient {
  return {
    async whoami() {
      return whoami;
    },
    async getMe() {
      throw new Error('not used');
    },
    async updateMe() {},
    async deleteMe() {},
    async logout() {},
    async logoutAll() {},
    async startEmailOtp() { return 'sent' as const; },
    async verifyEmailOtp() { return 'ok' as const; },
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return_to=${returnTo}`,
  };
}

function wrapperFor(whoami: WhoAmIResult | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider authClient={fakeAuthClient(whoami)} getPseudonym={() => 'Renard 423'}>
        {children}
      </AuthProvider>
    );
  };
}

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

describe('useCapability', () => {
  it('is true when the identity session carries the capability', async () => {
    const wrapper = wrapperFor({
      userId: USER_ID,
      displayName: 'Lapin 472',
      role: 'player',
      capabilities: ['billing:subscribe'],
    });
    const { result } = renderHook(() => useCapability('billing:subscribe'), { wrapper });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is false for a capability the session lacks', async () => {
    const wrapper = wrapperFor({
      userId: USER_ID,
      displayName: 'Lapin 472',
      role: 'player',
      capabilities: ['billing:subscribe'],
    });
    const { result } = renderHook(() => useCapability('survey:moderate'), { wrapper });

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('is false for an anonymous session', async () => {
    const { result } = renderHook(() => useCapability('billing:subscribe'), {
      wrapper: wrapperFor(null),
    });

    await waitFor(() => expect(result.current).toBe(false));
  });
});

describe('useRole', () => {
  it('is guest with no session', async () => {
    const { result } = renderHook(() => useRole(), { wrapper: wrapperFor(null) });

    await waitFor(() => expect(result.current).toBe('guest'));
  });

  it('is player for an authed player session', async () => {
    const wrapper = wrapperFor({
      userId: USER_ID,
      displayName: 'Lapin 472',
      role: 'player',
      capabilities: [],
    });
    const { result } = renderHook(() => useRole(), { wrapper });

    await waitFor(() => expect(result.current).toBe('player'));
  });

  it('is maintainer for an authed maintainer session', async () => {
    const wrapper = wrapperFor({
      userId: USER_ID,
      displayName: 'Lapin 472',
      role: 'maintainer',
      capabilities: ['billing:subscribe'],
    });
    const { result } = renderHook(() => useRole(), { wrapper });

    await waitFor(() => expect(result.current).toBe('maintainer'));
  });
});
