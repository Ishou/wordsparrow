import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectAxeClean } from '@/test/a11y';

vi.mock('@/ui/lib/shareInvite', () => ({
  canNativeShare: vi.fn(() => false),
  shareOrCopyInviteUrl: vi.fn(async () => 'copied' as const),
}));

import { canNativeShare, shareOrCopyInviteUrl } from '@/ui/lib/shareInvite';
import { ShareInviteButton } from '@/ui/components/lobby/ShareInviteButton';

const CODE = 'A2B3C4';

describe('ShareInviteButton', () => {
  beforeEach(() => {
    vi.mocked(shareOrCopyInviteUrl).mockClear().mockResolvedValue('copied');
    vi.mocked(canNativeShare).mockReturnValue(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('copies the canonical /join/<code> URL and shows the confirmation', async () => {
    render(<ShareInviteButton code={CODE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    await waitFor(() =>
      expect(shareOrCopyInviteUrl).toHaveBeenCalledWith(`${window.location.origin}/join/${CODE}`),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Copié');
  });

  it('labels the button "Partager le lien" when a native share sheet is available', () => {
    vi.mocked(canNativeShare).mockReturnValue(true);
    render(<ShareInviteButton code={CODE} />);
    expect(screen.getByRole('button', { name: 'Partager le lien' })).toBeInTheDocument();
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
