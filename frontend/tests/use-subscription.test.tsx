import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BillingClient, SubscriptionView } from '@/application/billing';
import { BillingError } from '@/application/billing';
import { useSubscription } from '@/ui/components/billing';

const view: SubscriptionView = { tier: 'supporter', status: 'active', periodEnd: '2026-07-29T00:00:00Z' };

function makeClient(getSubscription: BillingClient['getSubscription']): BillingClient {
  return {
    getSubscription,
    createCheckoutSession: vi.fn(),
    cancelSubscription: vi.fn(),
  };
}

describe('useSubscription', () => {
  it('starts loading then resolves to the subscription view', async () => {
    const getSubscription = vi.fn().mockResolvedValue(view);
    const client = makeClient(getSubscription);
    const { result } = renderHook(() => useSubscription(client));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subscription).toEqual(view);
    expect(result.current.error).toBeNull();
    expect(getSubscription).toHaveBeenCalledTimes(1);
  });

  it('refetch() triggers an additional load', async () => {
    const getSubscription = vi.fn().mockResolvedValue(view);
    const client = makeClient(getSubscription);
    const { result } = renderHook(() => useSubscription(client));
    await waitFor(() => expect(getSubscription).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(getSubscription).toHaveBeenCalledTimes(2));
  });

  it('surfaces a typed error and clears the subscription on failure', async () => {
    const getSubscription = vi.fn().mockRejectedValue(new BillingError('auth-required', 401));
    const client = makeClient(getSubscription);
    const { result } = renderHook(() => useSubscription(client));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subscription).toBeNull();
    expect(result.current.error).toBeInstanceOf(BillingError);
  });
});
