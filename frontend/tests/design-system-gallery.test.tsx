import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesignSystemGallery } from '@/design-system/gallery/DesignSystemGallery';
import { expectAxeClean } from '@/test/a11y';

describe('DesignSystemGallery', () => {
  it('renders the heading and one swatch per v2 colour token', async () => {
    const { container } = render(<DesignSystemGallery />);
    expect(screen.getByRole('heading', { name: /Design System v2/ })).toBeTruthy();
    expect(document.querySelectorAll('[data-token]')).toHaveLength(8);
    expect(document.querySelector('[data-token="ws.sakura"]')).not.toBeNull();
    expect(document.querySelector('[data-token="ws.jadeInk"]')).not.toBeNull();
    await expectAxeClean(container);
  });
});
