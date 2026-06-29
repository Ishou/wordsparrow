import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createMatomoTracker } from '@/infrastructure/analytics/matomoTracker';

beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = '';
  delete (window as unknown as { _paq?: unknown[] })._paq;
});

afterEach(() => {
  vi.useRealTimers();
});

test('queues _paq synchronously but injects matomo.js only after idle', () => {
  const tracker = createMatomoTracker({ url: 'https://analytics.example', siteId: '1' });
  // _paq is configured synchronously
  expect((window as unknown as { _paq: unknown[] })._paq.length).toBeGreaterThan(0);
  // script not yet injected
  expect(document.querySelector('script[data-matomo="1"]')).toBeNull();
  // after idle/timer flush it is
  vi.runAllTimers();
  expect(document.querySelector('script[data-matomo="1"]')).not.toBeNull();
  expect(tracker).toBeDefined();
});
