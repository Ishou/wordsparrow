import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingClient, SubscriptionView } from '@/application/billing';

// Stub the router's `<Link>` so the polling assertions run under fake timers without a router transition.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  };
});

const { CheckoutSuccessScreen } = await import('@/ui/routes/abonnement.succes');

const PENDING_VIEW: SubscriptionView = { tier: 'premium', status: 'pending', periodEnd: null };
const ACTIVE_VIEW: SubscriptionView = {
  tier: 'premium',
  status: 'active',
  periodEnd: '2026-08-01T00:00:00Z',
};

function fakeBillingClient(getSubscription: BillingClient['getSubscription']): BillingClient {
  return {
    getSubscription,
    createCheckoutSession: vi.fn(),
    cancelSubscription: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('CheckoutSuccessScreen', () => {
  it('polls then shows the active state once the webhook confirms the subscription', async () => {
    const getSubscription = vi
      .fn<BillingClient['getSubscription']>()
      .mockResolvedValueOnce(PENDING_VIEW)
      .mockResolvedValue(ACTIVE_VIEW);
    render(<CheckoutSuccessScreen client={fakeBillingClient(getSubscription)} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/confirmation en cours/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText(/abonnement est actif/i)).toBeInTheDocument();
    expect(getSubscription).toHaveBeenCalledTimes(2);
  });

  it('shows the neutral timeout message after the polling cap with no active status', async () => {
    const getSubscription = vi.fn<BillingClient['getSubscription']>().mockResolvedValue(PENDING_VIEW);
    render(<CheckoutSuccessScreen client={fakeBillingClient(getSubscription)} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(screen.getByText(/plus de temps que prévu/i)).toBeInTheDocument();
    expect(getSubscription).toHaveBeenCalledTimes(5);
  });

  it('stops polling once active without ticking through the whole cap', async () => {
    const getSubscription = vi.fn<BillingClient['getSubscription']>().mockResolvedValue(ACTIVE_VIEW);
    render(<CheckoutSuccessScreen client={fakeBillingClient(getSubscription)} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/abonnement est actif/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(getSubscription).toHaveBeenCalledTimes(1);
  });
});
