import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@/application/auth';
import { AuthProvider } from '@/ui/components/auth';
import { MenuSheet } from '@/ui/v2/MenuSheet';
import type { CapabilityGateStatus } from '@/ui/v2/useCapabilityGate';

// The row is gated on this hook; drive its three states directly so the no-flash contract is asserted in isolation.
let gateStatus: CapabilityGateStatus = 'loading';
vi.mock('@/ui/v2/useCapabilityGate', () => ({
  useCapabilityGate: () => gateStatus,
}));

function guestAuthClient(): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(null),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    startEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInUrl: (provider: string, returnTo: string) => `https://auth.test/${provider}?return=${returnTo}`,
  } as unknown as AuthClient;
}

function renderMenu() {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          Ouvrir le menu
        </button>
        <MenuSheet open={open} onClose={() => setOpen(false)} />
      </>
    );
  }
  const rootRoute = createRootRoute();
  const route = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Harness });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(
    <AuthProvider authClient={guestAuthClient()} getPseudonym={() => 'Invité'}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

async function openMenu() {
  fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le menu' }));
  await screen.findByRole('dialog');
}

describe('MenuSheet signalements link (capability-gated, no flash)', () => {
  afterEach(() => {
    gateStatus = 'loading';
  });

  it('renders the Signalements row when the capability is allowed', async () => {
    gateStatus = 'allowed';
    renderMenu();
    await openMenu();
    expect(screen.getByRole('button', { name: 'Signalements' })).toBeInTheDocument();
  });

  it('does not render the row while the gate is loading', async () => {
    gateStatus = 'loading';
    renderMenu();
    await openMenu();
    expect(screen.queryByRole('button', { name: 'Signalements' })).toBeNull();
  });

  it('does not render the row when the gate denies', async () => {
    gateStatus = 'denied';
    renderMenu();
    await openMenu();
    expect(screen.queryByRole('button', { name: 'Signalements' })).toBeNull();
  });
});
