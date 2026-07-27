import { UsersThree } from '@phosphor-icons/react';
import { render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@/application/auth';
import { SignInSheet } from '@/ui/v2/SignInSheet';
import { expectAxeClean } from '@/test/a11y';

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

// The sheet reads window.location so it returns the player to the page it mounted on, which memory history does not drive.
function renderSheetAt(path: string, onClose = vi.fn()) {
  window.history.pushState({}, '', path);
  const rootRoute = createRootRoute({
    component: () => (
      <SignInSheet
        open
        authClient={stubAuthClient()}
        onClose={onClose}
        icon={UsersThree}
        title="Garde ta progression"
        description="Connecte-toi pour retrouver tes grilles."
      />
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('SignInSheet', () => {
  it('renders the copy it is given', async () => {
    renderSheetAt('/play?id=abc');
    expect(await screen.findByText('Garde ta progression')).toBeTruthy();
    expect(screen.getByText('Connecte-toi pour retrouver tes grilles.')).toBeTruthy();
  });

  it('sends the page it was opened from as the OAuth return_to', async () => {
    renderSheetAt('/play?id=abc');
    const google = await screen.findByRole('link', { name: /Google/ });
    await waitFor(() => expect(google.getAttribute('href')).toContain('return='));
    expect(decodeURIComponent(google.getAttribute('href') ?? '')).toContain('/play?id=abc');
  });

  it('keeps the Google control an anchor so the browser follows the 302 chain', async () => {
    renderSheetAt('/grilles');
    const google = await screen.findByRole('link', { name: /Google/ });
    expect(google.tagName).toBe('A');
    await waitFor(() => expect(google.getAttribute('aria-disabled')).toBeNull());
  });

  // Email-OTP is dark (VITE_FEATURE_EMAIL_AUTH=false); the link appears with the flag, not before.
  it('omits the email sign-in link while the flag is off', async () => {
    renderSheetAt('/play?id=abc');
    await screen.findByRole('dialog');
    expect(screen.queryByRole('link', { name: /e-mail/i })).toBeNull();
  });

  it('is axe-clean when open (ADR-0050)', async () => {
    const { baseElement } = renderSheetAt('/play?id=abc');
    await screen.findByRole('dialog');
    await expectAxeClean(baseElement);
  });
});
