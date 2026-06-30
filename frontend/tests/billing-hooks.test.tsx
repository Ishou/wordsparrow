import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { BillingClient, Entitlement } from '@/application/billing';
import { EntitlementProvider, useCapability, useEntitlement, useRole } from '@/ui/billing';
import { AuthProvider } from '@/ui/components/auth';

const ENTITLEMENT: Entitlement = {
  tier: 'supporter',
  status: 'active',
  periodEnd: '2026-07-29T00:00:00Z',
  capabilities: ['daily-archive', 'no-ads'],
};

function makeBillingClient(overrides: Partial<BillingClient> = {}): BillingClient {
  return {
    getEntitlement: vi.fn().mockResolvedValue(ENTITLEMENT),
    createCheckoutSession: vi.fn(),
    cancelSubscription: vi.fn(),
    ...overrides,
  };
}

function withBilling(client: BillingClient) {
  return ({ children }: { children: ReactNode }) => (
    <EntitlementProvider billingClient={client}>{children}</EntitlementProvider>
  );
}

function makeAuthClient(whoami: WhoAmIResult | null): AuthClient {
  return {
    whoami: async () => whoami,
    getMe: async () => {
      throw new Error('not used');
    },
    updateMe: async () => {},
    deleteMe: async () => {},
    logout: async () => {},
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return_to=${returnTo}`,
  };
}

function withAuth(auth: AuthClient) {
  return ({ children }: { children: ReactNode }) => (
    <AuthProvider authClient={auth} getPseudonym={() => 'Renard 423'}>
      {children}
    </AuthProvider>
  );
}

describe('useEntitlement', () => {
  it('loads then exposes the entitlement', async () => {
    const { result } = renderHook(() => useEntitlement(), { wrapper: withBilling(makeBillingClient()) });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe('supporter');
    expect(result.current.status).toBe('active');
    expect(result.current.capabilities).toEqual(['daily-archive', 'no-ads']);
    expect(result.current.error).toBeNull();
  });

  it('refetches on demand', async () => {
    const getEntitlement = vi
      .fn()
      .mockResolvedValueOnce(ENTITLEMENT)
      .mockResolvedValueOnce({ ...ENTITLEMENT, tier: 'patron' });
    const { result } = renderHook(() => useEntitlement(), {
      wrapper: withBilling(makeBillingClient({ getEntitlement })),
    });

    await waitFor(() => expect(result.current.tier).toBe('supporter'));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.tier).toBe('patron');
    expect(getEntitlement).toHaveBeenCalledTimes(2);
  });

  it('surfaces a fetch error and clears the entitlement', async () => {
    const getEntitlement = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEntitlement(), {
      wrapper: withBilling(makeBillingClient({ getEntitlement })),
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.tier).toBeNull();
  });
});

describe('useCapability', () => {
  it('is true for a held capability and false otherwise', async () => {
    const { result } = renderHook(
      () => ({ held: useCapability('no-ads'), absent: useCapability('elite') }),
      { wrapper: withBilling(makeBillingClient()) },
    );

    await waitFor(() => expect(result.current.held).toBe(true));
    expect(result.current.absent).toBe(false);
  });
});

describe('useRole', () => {
  it('resolves guest with no session', async () => {
    const { result } = renderHook(() => useRole(), { wrapper: withAuth(makeAuthClient(null)) });
    await waitFor(() => expect(result.current).toBe('guest'));
  });

  it('resolves player for an authed player', async () => {
    const { result } = renderHook(() => useRole(), {
      wrapper: withAuth(makeAuthClient({ userId: 'u', displayName: 'Lapin 472', role: 'player' })),
    });
    await waitFor(() => expect(result.current).toBe('player'));
  });

  it('resolves maintainer for an authed maintainer', async () => {
    const { result } = renderHook(() => useRole(), {
      wrapper: withAuth(makeAuthClient({ userId: 'u', displayName: 'Boss', role: 'maintainer' })),
    });
    await waitFor(() => expect(result.current).toBe('maintainer'));
  });

  it('resolves guest outside an AuthProvider', () => {
    const { result } = renderHook(() => useRole());
    expect(result.current).toBe('guest');
  });
});
