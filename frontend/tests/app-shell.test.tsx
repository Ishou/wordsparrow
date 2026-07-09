import { render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@/application/auth';
import { AuthProvider } from '@/ui/components/auth';
import { AppShell } from '@/ui/v2/AppShell';

function stubAuthClient(): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(null),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    startEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${encodeURIComponent(returnTo)}`,
  };
}

// AppShell renders DesktopAppBar (its <Link> needs a router; its MenuSheet reads useAuth) — mount both providers.
function renderShell(ui: ReactNode) {
  const rootRoute = createRootRoute({
    component: () => (
      <AuthProvider authClient={stubAuthClient()} getPseudonym={() => 'Renard 423'}>
        {ui}
      </AuthProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('AppShell (flow)', () => {
  it('exposes exactly one <main id="main-content"> scroll landmark', async () => {
    renderShell(
      <AppShell topBar={<div data-testid="tb" />} bottomBar={<div data-testid="bb" />}>
        <p>content</p>
      </AppShell>,
    );
    const main = await screen.findByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('tb')).toBeInTheDocument();
    expect(screen.getByTestId('bb')).toBeInTheDocument();
  });

  it('renders the skip link as the first shell child', async () => {
    const { container } = renderShell(<AppShell><p>c</p></AppShell>);
    await screen.findByRole('main');
    const shell = container.querySelector('[lang="fr"]') as HTMLElement;
    expect(shell.firstChild).toHaveAttribute('href', '#main-content');
  });
});
