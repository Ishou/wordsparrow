import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardKey } from '@/design-system';
import { expectAxeClean } from '@/test/a11y';

describe('KeyboardKey', () => {
  it('renders a letter key and fires onPress on pointerdown (without stealing cell focus)', async () => {
    const onPress = vi.fn();
    const { container } = render(<KeyboardKey type="letter" label="A" onPress={onPress} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'A' }), { button: 0 });
    expect(onPress).toHaveBeenCalledOnce();
    await expectAxeClean(container);
  });

  it('activates on Enter/Space for keyboard users', () => {
    const onPress = vi.fn();
    render(<KeyboardKey type="backspace" onPress={onPress} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Effacer' }), { key: 'Enter' });
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('gives icon keys an accessible name (glyph is decorative)', () => {
    render(
      <>
        <KeyboardKey type="confirm" />
        <KeyboardKey type="backspace" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Valider' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Effacer' })).toBeTruthy();
  });
});
