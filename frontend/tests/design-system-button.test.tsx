import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/design-system';
import { expectAxeClean } from '@/test/a11y';

describe('Button', () => {
  it('renders variants, fires onClick, and respects disabled', async () => {
    const onClick = vi.fn();
    const { container, rerender } = render(<Button variant="primary" onClick={onClick}>Jouer</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<Button variant="secondary" disabled onClick={onClick}>Partager</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Partager' }));
    expect(onClick).toHaveBeenCalledOnce();
    await expectAxeClean(container);
  });
});
