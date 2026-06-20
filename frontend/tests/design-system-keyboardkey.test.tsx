import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardKey } from '@/design-system';
import { expectAxeClean } from '@/test/a11y';

describe('KeyboardKey', () => {
  it('renders a letter key and fires onPress', async () => {
    const onPress = vi.fn();
    const { container } = render(<KeyboardKey type="letter" label="A" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    expect(onPress).toHaveBeenCalledOnce();
    await expectAxeClean(container);
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
