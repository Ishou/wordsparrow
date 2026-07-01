import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import { AuthProvider } from '@/ui/components/auth';

// PhoneShell pulls router + root-context primitives (DesktopAppBar → MenuSheet); stub them so screens render without a full router.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
      <a href={String(to)} className={className}>
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
    useRouteContext: () => ({}),
  };
});

const { TransparencePanel, AbonnementTransparenceScreen } = await import('@/ui/v2/AbonnementTransparenceScreen');

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

function fakeAuthClient(whoami: WhoAmIResult | null): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(whoami),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return_to=${returnTo}`,
  };
}

const SUBSCRIBER: WhoAmIResult = {
  userId: USER_ID,
  displayName: 'Lapin 472',
  role: 'maintainer',
  capabilities: ['billing:subscribe'],
};

function withAuth(whoami: WhoAmIResult | null) {
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

describe('TransparencePanel', () => {
  it('renders the factual funding points with no solicitation copy', () => {
    render(<TransparencePanel />);

    expect(screen.getByRole('heading', { level: 1, name: /Où va ton argent/ })).toBeInTheDocument();
    expect(screen.getByText(/Le jeu reste entièrement gratuit/)).toBeInTheDocument();
    expect(screen.getByText('Serveurs & hébergement')).toBeInTheDocument();
    expect(screen.getByText('Génération des grilles')).toBeInTheDocument();
    expect(screen.getByText('Le temps de développement')).toBeInTheDocument();
    expect(screen.getByText(/fait par une seule personne/)).toBeInTheDocument();
    expect(screen.getByText(/Pas de pub, jamais/)).toBeInTheDocument();
    // Factual framing (ADR-0080): no donation/support solicitation.
    expect(screen.queryByText(/soutiens|soutenir|don\b|faire un don/i)).toBeNull();
  });
});

describe('AbonnementTransparenceScreen capability gate', () => {
  it('renders the panel for an authed user with billing:subscribe', async () => {
    render(<AbonnementTransparenceScreen />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByRole('heading', { level: 1, name: /Où va ton argent/ })).toBeInTheDocument();
  });

  it('renders the standard 404 for an anonymous visitor', async () => {
    render(<AbonnementTransparenceScreen />, { wrapper: withAuth(null) });

    expect(await screen.findByText("Cette page s'est envolée")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /Où va ton argent/ })).toBeNull();
  });
});
