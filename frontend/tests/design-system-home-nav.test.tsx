import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatCard, StreakPill, DifficultyDots, CalendarDay, BottomNav, DailyCard } from '@/design-system';
import { expectAxeClean } from '@/test/a11y';

describe('home + nav components', () => {
  it('StatCard renders both stats, a11y clean', async () => {
    const { container } = render(<StatCard temps="02:14" serie="🔥 8" />);
    expect(screen.getByText('Temps')).toBeTruthy();
    expect(screen.getByText('02:14')).toBeTruthy();
    expect(screen.getByText('Série')).toBeTruthy();
    await expectAxeClean(container);
  });

  it('StreakPill names the streak for assistive tech', async () => {
    const { container } = render(<StreakPill streak={7} timer="02:14" />);
    expect(screen.getByLabelText('Série de 7 jours')).toBeTruthy();
    await expectAxeClean(container);
  });

  it('DifficultyDots exposes the level name', async () => {
    const { container } = render(<DifficultyDots level="difficile" />);
    expect(screen.getByLabelText('Niveau : Difficile')).toBeTruthy();
    await expectAxeClean(container);
  });

  it('CalendarDay labels day + state', async () => {
    const { container } = render(<CalendarDay day={20} state="today" />);
    expect(screen.getByLabelText("Jour 20, aujourd'hui")).toBeTruthy();
    await expectAxeClean(container);
  });

  it('BottomNav marks the active item and fires navigation', async () => {
    const onNavigate = vi.fn();
    const { container } = render(<BottomNav active="accueil" onNavigate={onNavigate} />);
    expect(screen.getByRole('button', { name: /Accueil/ }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: /Grilles/ }));
    expect(onNavigate).toHaveBeenCalledWith('grilles');
    await expectAxeClean(container);
  });

  it('DailyCard composes date + difficulty + play button', async () => {
    const onPlay = vi.fn();
    const { container } = render(<DailyCard date="Mercredi 20 juin" level="moyen" onPlay={onPlay} />);
    expect(screen.getByText('Mercredi 20 juin')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Jouer' }));
    expect(onPlay).toHaveBeenCalledOnce();
    await expectAxeClean(container);
  });
});
