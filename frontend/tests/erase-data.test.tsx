import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@/application/auth';
import type { AuthState } from '@/ui/components/auth';

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';
const DISPLAY_NAME = 'Lapin 472';

let routeContext: Record<string, unknown> = {};
let authState: AuthState = { status: 'authed', whoami: { userId: USER_ID, displayName: DISPLAY_NAME } };
let refresh = vi.fn().mockResolvedValue(undefined);

// Stub authClient + useAuth directly rather than driving a real AuthProvider round-trip.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useRouteContext: () => routeContext,
  };
});

vi.mock('@/ui/components/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/components/auth')>();
  return {
    ...actual,
    useAuth: () => ({ state: authState, status: authState.status, refresh }),
  };
});

const { EraseData } = await import('@/ui/v2/EraseData');

function fakeAuthClient(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    whoami: vi.fn(),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${returnTo}`,
    ...overrides,
  };
}

const originalLocation = window.location;

beforeEach(() => {
  authState = { status: 'authed', whoami: { userId: USER_ID, displayName: DISPLAY_NAME } };
  refresh = vi.fn().mockResolvedValue(undefined);
  routeContext = {};
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

async function openAndTypeConfirmation() {
  fireEvent.click(screen.getByRole('button', { name: 'Effacer mes données' }));
  const input = await screen.findByLabelText('Confirmation du pseudonyme');
  fireEvent.change(input, { target: { value: DISPLAY_NAME } });
}

describe('EraseData', () => {
  it('hard-navigates home when the erase succeeds but the session refresh fails', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: 'http://localhost/compte' },
    });
    routeContext = { authClient: fakeAuthClient({ deleteMe: vi.fn().mockResolvedValue(undefined) }) };
    refresh.mockRejectedValue(new Error('offline'));

    render(<EraseData />);
    await openAndTypeConfirmation();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Effacer définitivement' }));
    });

    await waitFor(() => expect(window.location.href).toBe('/'));
  });

  it('shows an inline error and stays open when deleteMe itself fails', async () => {
    routeContext = { authClient: fakeAuthClient({ deleteMe: vi.fn().mockRejectedValue(new Error('boom')) }) };

    render(<EraseData />);
    await openAndTypeConfirmation();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Effacer définitivement' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/La suppression a échoué/i);
    expect(refresh).not.toHaveBeenCalled();
  });
});
