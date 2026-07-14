import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mocks flushSync so the nested say() call fires synchronously inside the guard's protected window.
const { reentrantHolder } = vi.hoisted(() => ({ reentrantHolder: { fn: null as (() => void) | null } }));

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return {
    ...actual,
    flushSync: (cb: () => void) => {
      const result = actual.flushSync(cb);
      const fn = reentrantHolder.fn;
      if (fn) {
        reentrantHolder.fn = null;
        fn();
      }
      return result;
    },
  };
});

const { AnnouncerProvider, useAnnouncer } = await import('@/ui/components/a11y/Announcer');

function Harness({ onSay }: { onSay: (say: (text: string, opts?: { assertive?: boolean }) => void) => void }) {
  const announcer = useAnnouncer();
  onSay(announcer.say);
  return null;
}

describe('Announcer', () => {
  it('renders two live regions: polite and assertive', () => {
    const { container } = render(
      <AnnouncerProvider>
        <div />
      </AnnouncerProvider>,
    );
    const polite = container.querySelector('[aria-live="polite"]');
    const assertive = container.querySelector('[aria-live="assertive"]');
    expect(polite).not.toBeNull();
    expect(assertive).not.toBeNull();
  });

  it('say(text) writes to the polite region', () => {
    let say!: (t: string, o?: { assertive?: boolean }) => void;
    const { container } = render(
      <AnnouncerProvider>
        <Harness onSay={(s) => { say = s; }} />
      </AnnouncerProvider>,
    );
    act(() => { say('coucou'); });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('coucou');
    expect(container.querySelector('[aria-live="assertive"]')?.textContent).toBe('');
  });

  it('say(text, { assertive: true }) writes to the assertive region', () => {
    let say!: (t: string, o?: { assertive?: boolean }) => void;
    const { container } = render(
      <AnnouncerProvider>
        <Harness onSay={(s) => { say = s; }} />
      </AnnouncerProvider>,
    );
    act(() => { say('erreur', { assertive: true }); });
    expect(container.querySelector('[aria-live="assertive"]')?.textContent).toBe('erreur');
  });

  it('de-duplicates identical messages within 200ms (per channel)', () => {
    vi.useFakeTimers();
    let say!: (t: string, o?: { assertive?: boolean }) => void;
    const { container } = render(
      <AnnouncerProvider>
        <Harness onSay={(s) => { say = s; }} />
      </AnnouncerProvider>,
    );
    act(() => { say('même'); });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('même');
    // Clear and try to re-emit identical text within 200ms — should be skipped (text stays empty after clear).
    act(() => {
      container.querySelector('[aria-live="polite"]')!.textContent = '';
      say('même');
    });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('');
    // After 200ms, identical text emits again.
    act(() => { vi.advanceTimersByTime(250); say('même'); });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('même');
    vi.useRealTimers();
  });

  it('drops a say() that re-enters while an outer say() is still inside its flushSync window', () => {
    let say!: (t: string, o?: { assertive?: boolean }) => void;
    const { container } = render(
      <AnnouncerProvider>
        <Harness onSay={(s) => { say = s; }} />
      </AnnouncerProvider>,
    );

    // Same shape as grid word-entry re-entering say() during another say()'s commit (React #185).
    reentrantHolder.fn = () => say('nested-during-flush', { assertive: true });

    expect(() => {
      act(() => { say('outer'); });
    }).not.toThrow();

    // Outer announcement survives; the reentrant one is silently dropped, not queued.
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('outer');
    expect(container.querySelector('[aria-live="assertive"]')?.textContent).toBe('');
  });
});
