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
import { t } from '@/ui/i18n';
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

  it('fillBody stops <main> from scrolling and delegates to the inner flex column', async () => {
    renderShell(
      <AppShell topBar={<div data-testid="tb" />} bottomBar={<div data-testid="bb" />} fillBody>
        <div data-testid="pinned-head" />
      </AppShell>,
    );
    const main = await screen.findByRole('main');
    // Panda's cx keeps both utilities in the class list; ov-y_hidden wins the cascade via source order.
    expect(main.className).toMatch(/(^|\s)ov-y_hidden(\s|$)/);
    expect(main.className).toMatch(/(^|\s)d_flex(\s|$)/);
    expect(main.className).toMatch(/(^|\s)flex-d_column(\s|$)/);
    // The wrapper is innerFill (flex:1, minHeight:0), not the passthrough `inner` (display:contents).
    const wrapper = screen.getByTestId('pinned-head').parentElement;
    expect(wrapper?.className).toMatch(/(^|\s)flex_1(\s|$)/);
    expect(wrapper?.className).not.toMatch(/(^|\s)d_contents(\s|$)/);
  });

  it('without fillBody, <main> stays the sole scroll container', async () => {
    renderShell(
      <AppShell topBar={<div data-testid="tb" />} bottomBar={<div data-testid="bb" />}>
        <div data-testid="content" />
      </AppShell>,
    );
    const main = await screen.findByRole('main');
    expect(main.className).toMatch(/(^|\s)ov-y_auto(\s|$)/);
    expect(main.className).not.toMatch(/(^|\s)ov-y_hidden(\s|$)/);
    const wrapper = screen.getByTestId('content').parentElement;
    expect(wrapper?.className).toMatch(/(^|\s)d_contents(\s|$)/);
  });
});

describe('AppShell (overlay)', () => {
  it('keeps the middle full-bleed with the floating bars inside <main>', async () => {
    renderShell(
      <AppShell variant="overlay" topBar={<div data-testid="tb" />} bottomBar={<div data-testid="bb" />}>
        <div data-testid="viewport" />
      </AppShell>,
    );
    const main = await screen.findByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    // Overlay bars float over the full-bleed middle: they live inside <main>, unlike the flow rows.
    expect(main).toContainElement(screen.getByTestId('tb'));
    expect(main).toContainElement(screen.getByTestId('bb'));
    expect(main).toContainElement(screen.getByTestId('viewport'));
  });

  it('renders the flow bars outside <main> so the middle is the sole scroll row', async () => {
    renderShell(
      <AppShell variant="flow" topBar={<div data-testid="tb" />} bottomBar={<div data-testid="bb" />}>
        <div data-testid="viewport" />
      </AppShell>,
    );
    const main = await screen.findByRole('main');
    expect(main).not.toContainElement(screen.getByTestId('tb'));
    expect(main).not.toContainElement(screen.getByTestId('bb'));
    expect(main).toContainElement(screen.getByTestId('viewport'));
  });
});

describe.each(['flow', 'overlay'] as const)('AppShell (%s) desktopBar slot', (variant) => {
  it('falls back to the default DesktopAppBar when desktopBar is omitted', async () => {
    renderShell(
      <AppShell variant={variant}>
        <p>content</p>
      </AppShell>,
    );
    await screen.findByRole('main');
    expect(screen.getByLabelText(t('v2.nav.brandAria'))).toBeInTheDocument();
  });

  it('renders a supplied desktopBar instead of the default DesktopAppBar', async () => {
    renderShell(
      <AppShell variant={variant} desktopBar={<div data-testid="custom-desktop-bar" />}>
        <p>content</p>
      </AppShell>,
    );
    await screen.findByRole('main');
    expect(screen.getByTestId('custom-desktop-bar')).toBeInTheDocument();
    expect(screen.queryByLabelText(t('v2.nav.brandAria'))).not.toBeInTheDocument();
  });

  it('renders no desktop bar when desktopBar is explicitly null', async () => {
    renderShell(
      <AppShell variant={variant} desktopBar={null}>
        <p>content</p>
      </AppShell>,
    );
    await screen.findByRole('main');
    expect(screen.queryByLabelText(t('v2.nav.brandAria'))).not.toBeInTheDocument();
  });
});
