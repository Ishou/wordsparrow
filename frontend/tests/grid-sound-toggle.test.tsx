import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SoundStore } from '@/application/session/SoundStore';
import { GridSoundToggle } from '@/ui/play/GridSoundToggle';

function makeStore(initial: boolean): SoundStore {
  let value = initial;
  return {
    load: () => value,
    set: vi.fn((next: boolean) => {
      value = next;
    }),
  };
}

describe('GridSoundToggle', () => {
  it('offers a mute action when sound is on', () => {
    render(<GridSoundToggle soundStore={makeStore(true)} />);
    expect(screen.getByRole('button', { name: 'Couper les sons' })).toBeTruthy();
  });

  it('offers an unmute action when sound is off', () => {
    render(<GridSoundToggle soundStore={makeStore(false)} />);
    expect(screen.getByRole('button', { name: 'Activer les sons' })).toBeTruthy();
  });

  it('persists the change and flips the label on click', () => {
    const store = makeStore(true);
    render(<GridSoundToggle soundStore={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Couper les sons' }));
    expect(store.set).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Activer les sons' })).toBeTruthy();
  });
});
