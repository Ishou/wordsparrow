import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInstallPrompt } from '@/ui/lib/useInstallPrompt';

function Probe() {
  const { canInstall, promptInstall } = useInstallPrompt();
  return (
    <button type="button" disabled={!canInstall} onClick={promptInstall}>
      {canInstall ? 'installable' : 'hidden'}
    </button>
  );
}

function fireBeforeInstallPrompt(prompt = vi.fn().mockResolvedValue(undefined)) {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  e.prompt = prompt;
  e.userChoice = Promise.resolve({ outcome: 'accepted' as const });
  act(() => {
    window.dispatchEvent(e);
  });
  return prompt;
}

describe('useInstallPrompt', () => {
  it('is hidden until the platform fires beforeinstallprompt', () => {
    render(<Probe />);
    expect(screen.getByRole('button', { name: 'hidden' })).toBeDisabled();
    fireBeforeInstallPrompt();
    expect(screen.getByRole('button', { name: 'installable' })).toBeEnabled();
  });

  it('forwards promptInstall to the deferred event and disarms after the choice', async () => {
    render(<Probe />);
    const prompt = fireBeforeInstallPrompt();
    screen.getByRole('button', { name: 'installable' }).click();
    expect(prompt).toHaveBeenCalledOnce();
    // userChoice resolution disarms the affordance (one-shot event).
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'hidden' })).toBeDisabled();
  });

  it('never arms in standalone display mode', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<Probe />);
    fireBeforeInstallPrompt();
    expect(screen.getByRole('button', { name: 'hidden' })).toBeDisabled();
    window.matchMedia = original;
  });
});
