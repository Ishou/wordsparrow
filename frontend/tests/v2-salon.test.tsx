import { fireEvent, render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@/application/auth';
import type { Instant, Lobby, PlayerId, Pseudonym, SessionId } from '@/domain/game';
import { AuthProvider } from '@/ui/components/auth';
import { SalonScreen, type SalonScreenProps } from '@/ui/v2/multiplayer/SalonScreen';
import { expectAxeClean } from '@/test/a11y';

vi.mock('@phosphor-icons/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@phosphor-icons/react')>();
  return {
    ...actual,
    Copy: (props: Record<string, unknown>) => <svg data-testid="icon-copy" {...props} />,
    ShareNetwork: (props: Record<string, unknown>) => <svg data-testid="icon-share" {...props} />,
  };
});

const TOUCH_PRIMARY_QUERY = '(any-pointer: coarse) and (any-hover: none)';
const originalMatchMedia = window.matchMedia;

// `useTouchPrimary` reads this query; `true` = touch-primary device.
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: TOUCH_PRIMARY_QUERY,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as typeof window.matchMedia;
}

// `useCanNativeShare` also gates on `navigator.share`, absent by default in jsdom.
function stubNativeShareApi() {
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
}

// PhoneShell always mounts DesktopAppBar (CSS-hidden on phone), which renders MenuSheet and reads useAuth().
function fakeAuthClient(): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(null),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    startEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return_to=${returnTo}`,
  };
}

// SalonScreen renders the v2 BackHeader, whose TanStack <Link> needs a router context.
function renderInRouter(element: ReactElement) {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <AuthProvider authClient={fakeAuthClient()} getPseudonym={() => 'Renard 423'}>
        {element}
      </AuthProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

const ownerId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const guestId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c' as SessionId;
// Anon: playerId equals sessionId (ADR-0066 (e)).
const ownerPlayerId = ownerId as unknown as PlayerId;
const guestPlayerId = guestId as unknown as PlayerId;

const baseLobby: Lobby = {
  ownerSessionId: ownerId,
  players: [
    { playerId: ownerPlayerId, sessionId: ownerId, pseudonym: 'Hôte' as Pseudonym, joinedAt: '2026-06-27T15:30:00Z' as Instant },
    { playerId: guestPlayerId, sessionId: guestId, pseudonym: 'Amie' as Pseudonym, joinedAt: '2026-06-27T15:31:00Z' as Instant },
  ],
  state: 'WAITING',
  gridConfig: { width: 9, height: 9 },
  game: null,
  code: 'A2B3C4',
};

function renderSalon(overrides: Partial<SalonScreenProps> = {}) {
  const props: SalonScreenProps = {
    lobby: baseLobby,
    sessionId: ownerId,
    currentPlayerId: ownerPlayerId,
    connectionState: 'connected',
    pseudonymError: null,
    isStarting: false,
    isRotating: false,
    onRename: vi.fn(),
    onSetGridConfig: vi.fn(),
    onStart: vi.fn(),
    onRotateCode: vi.fn(),
    onCopyShareUrl: vi.fn(),
    onLeave: vi.fn(),
    onClearPseudonymError: vi.fn(),
    ...overrides,
  };
  return { props, ...renderInRouter(<SalonScreen {...props} />) };
}

// The router mounts asynchronously; await the heading before synchronous queries.
async function renderSalonReady(overrides: Partial<SalonScreenProps> = {}) {
  const result = renderSalon(overrides);
  await screen.findByRole('heading', { level: 1, name: 'Partie' });
  return result;
}

describe('v2 SalonScreen', () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    // @ts-expect-error -- test-only teardown of a jsdom stub.
    delete navigator.share;
  });

  it('shows the copy icon and label on a non-touch device', async () => {
    await renderSalonReady();
    expect(screen.getByRole('button', { name: /Copier le lien/ })).toBeTruthy();
    expect(screen.getByTestId('icon-copy')).toBeTruthy();
    expect(screen.queryByTestId('icon-share')).toBeNull();
  });

  it('shows the share icon and label on a touch device with navigator.share', async () => {
    stubMatchMedia(true);
    stubNativeShareApi();
    await renderSalonReady();
    expect(screen.getByRole('button', { name: /Partager le lien/ })).toBeTruthy();
    expect(screen.getByTestId('icon-share')).toBeTruthy();
    expect(screen.queryByTestId('icon-copy')).toBeNull();
  });

  it('falls back to the copy icon and label on a touch device without navigator.share', async () => {
    stubMatchMedia(true);
    await renderSalonReady();
    expect(screen.getByRole('button', { name: /Copier le lien/ })).toBeTruthy();
    expect(screen.getByTestId('icon-copy')).toBeTruthy();
    expect(screen.queryByTestId('icon-share')).toBeNull();
  });

  it('renders the title, the code and the copy + quitter affordances', async () => {
    await renderSalonReady();
    // Code is masked by default; reveal it before asserting the value.
    expect(screen.queryByText('A2B3C4')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Afficher le code/ }));
    expect(screen.getByText('A2B3C4')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copier le lien/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Quitter/ })).toBeTruthy();
  });

  it('lists every player with an owner badge and a (toi) marker on self', async () => {
    await renderSalonReady();
    expect(screen.getByText(/Joueurs \(2\/8\)/)).toBeTruthy();
    expect(screen.getByText('Hôte (toi)')).toBeTruthy();
    expect(screen.getByText('Amie')).toBeTruthy();
    expect(screen.getByText('Hôte')).toBeTruthy(); // owner badge text
  });

  it('shows owner controls (grid-size + Jouer) for the owner', async () => {
    await renderSalonReady({ sessionId: ownerId });
    expect(screen.getByRole('button', { name: 'Jouer' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Taille de la grille' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '9×9' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Nouveau code/ })).toBeTruthy();
  });

  it('exposes the 28×20 landscape preset and emits (28, 20) on selection', async () => {
    const { props } = await renderSalonReady({ sessionId: ownerId });
    fireEvent.click(screen.getByRole('button', { name: '28×20' }));
    expect(props.onSetGridConfig).toHaveBeenCalledWith(28, 20);
  });

  it('reflects a 28×20 lobby config as the pressed preset', async () => {
    const landscape: Lobby = { ...baseLobby, gridConfig: { width: 28, height: 20 } };
    await renderSalonReady({ sessionId: ownerId, lobby: landscape });
    expect(screen.getByRole('button', { name: '28×20' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '15×12' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('hides owner controls for a non-owner', async () => {
    await renderSalonReady({ sessionId: guestId });
    expect(screen.queryByRole('button', { name: 'Jouer' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Taille de la grille' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Nouveau code/ })).toBeNull();
    // The code (after reveal) + copy + quitter stay available to everyone.
    fireEvent.click(screen.getByRole('button', { name: /Afficher le code/ }));
    expect(screen.getByText('A2B3C4')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Quitter/ })).toBeTruthy();
  });

  it('wires the action callbacks', async () => {
    const { props } = await renderSalonReady();
    fireEvent.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(props.onStart).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Copier le lien/ }));
    expect(props.onCopyShareUrl).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Quitter/ }));
    expect(props.onLeave).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '11×11' }));
    expect(props.onSetGridConfig).toHaveBeenCalledWith(11, 11);
  });

  it('disables Jouer and flips the label while starting', async () => {
    await renderSalonReady({ isStarting: true });
    const jouer = screen.getByRole('button', { name: 'Démarrage…' });
    expect((jouer as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders no in-page connection banner — connection status is toast-owned', async () => {
    await renderSalonReady({ connectionState: 'disconnected' });
    expect(screen.queryByText(/Connexion perdue/)).toBeNull();
    expect(screen.queryByText(/Connexion à la partie/)).toBeNull();
  });

  it('is axe-clean for the owner (ADR-0050)', async () => {
    const { container } = await renderSalonReady({ sessionId: ownerId });
    await expectAxeClean(container);
  });

  it('is axe-clean for a non-owner (ADR-0050)', async () => {
    const { container } = await renderSalonReady({ sessionId: guestId });
    await expectAxeClean(container);
  });
});
