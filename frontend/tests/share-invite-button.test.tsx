import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectAxeClean } from '@/test/a11y';

vi.mock('@/ui/lib/shareInvite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/lib/shareInvite')>();
  return {
    ...actual,
    shareOrCopyInviteUrl: vi.fn(async () => 'copied' as const),
  };
});

vi.mock('@phosphor-icons/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@phosphor-icons/react')>();
  return {
    ...actual,
    Copy: (props: Record<string, unknown>) => <svg data-testid="icon-copy" {...props} />,
    ShareNetwork: (props: Record<string, unknown>) => <svg data-testid="icon-share" {...props} />,
  };
});

import { shareOrCopyInviteUrl } from '@/ui/lib/shareInvite';
import { ShareInviteButton } from '@/ui/components/lobby/ShareInviteButton';

const CODE = 'A2B3C4';
const QUERY = '(any-pointer: coarse) and (any-hover: none)';
const originalMatchMedia = window.matchMedia;

// `useTouchPrimary` reads this query; `true` = touch-primary device.
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: QUERY,
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

describe('ShareInviteButton', () => {
  beforeEach(() => {
    vi.mocked(shareOrCopyInviteUrl).mockClear().mockResolvedValue('copied');
    stubMatchMedia(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia;
    // @ts-expect-error -- test-only teardown of a jsdom stub.
    delete navigator.share;
  });

  it('copies the canonical /join/<code> URL and shows the confirmation', async () => {
    render(<ShareInviteButton code={CODE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    await waitFor(() =>
      expect(shareOrCopyInviteUrl).toHaveBeenCalledWith(`${window.location.origin}/join/${CODE}`),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Copié');
  });

  it('renders the copy icon and "Copier le lien" label on a non-touch device', () => {
    render(<ShareInviteButton code={CODE} />);
    expect(screen.getByRole('button', { name: 'Copier le lien' })).toBeInTheDocument();
    expect(screen.getByTestId('icon-copy')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-share')).toBeNull();
  });

  it('renders the share icon and "Partager le lien" label on a touch device', () => {
    stubMatchMedia(true);
    stubNativeShareApi();
    render(<ShareInviteButton code={CODE} />);
    expect(screen.getByRole('button', { name: 'Partager le lien' })).toBeInTheDocument();
    expect(screen.getByTestId('icon-share')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-copy')).toBeNull();
  });

  it('renders the copy icon on a touch device that lacks navigator.share (finding: icon must match behavior)', () => {
    stubMatchMedia(true);
    render(<ShareInviteButton code={CODE} />);
    expect(screen.getByRole('button', { name: 'Copier le lien' })).toBeInTheDocument();
    expect(screen.getByTestId('icon-copy')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-share')).toBeNull();
  });

  it('does not show the confirmation when the share was dismissed (not copied)', async () => {
    vi.mocked(shareOrCopyInviteUrl).mockResolvedValue('dismissed');
    render(<ShareInviteButton code={CODE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    await waitFor(() => expect(shareOrCopyInviteUrl).toHaveBeenCalled());
    expect(screen.queryByText('Copié')).not.toBeInTheDocument();
  });

  it('clears the confirmation after the timeout', async () => {
    vi.useFakeTimers();
    render(<ShareInviteButton code={CODE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    await vi.waitFor(() => expect(shareOrCopyInviteUrl).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Copié');
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByRole('status')).not.toHaveTextContent('Copié');
  });

  it('has an accessible name and is axe-clean (ADR-0050)', async () => {
    const { container } = render(<ShareInviteButton code={CODE} />);
    expect(screen.getByRole('button')).toHaveAccessibleName();
    await expectAxeClean(container);
  });
});
