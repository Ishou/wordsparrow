import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture handlers and the constructor options the SUT passes to Workbox.
const controllingHandlers: Array<() => void> = [];
const waitingHandlers: Array<() => void> = [];
const constructorCalls: Array<{ scriptUrl: string; options?: unknown }> = [];
let registerResult: { waiting?: unknown } | undefined = {};
const wbRegister = vi.fn(() => Promise.resolve(registerResult));
const wbUpdate = vi.fn(() => Promise.resolve());
const wbMessageSkipWaiting = vi.fn();

// Vitest 4 narrowed `vi.fn().mockImplementation(arrow)` so the resulting
// mock is no longer constructable (`new MockedFn(...)` throws "is not a
// constructor"). Use a regular `function` expression so it carries its
// own `[[Construct]]` slot. Same observable behaviour, different shape.
vi.mock('workbox-window', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Workbox: vi.fn(function (this: any, scriptUrl: string, options?: unknown) {
    constructorCalls.push({ scriptUrl, options });
    this.addEventListener = (type: string, fn: () => void) => {
      if (type === 'controlling') controllingHandlers.push(fn);
      if (type === 'waiting') waitingHandlers.push(fn);
    };
    this.register = wbRegister;
    this.update = wbUpdate;
    this.messageSkipWaiting = wbMessageSkipWaiting;
  }),
}));

import { registerServiceWorker } from '@/infrastructure/pwa';

const fireControlling = () => {
  for (const fn of controllingHandlers) fn();
};
const fireWaiting = () => {
  for (const fn of waitingHandlers) fn();
};

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
}
const goHidden = () => {
  setVisibility('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
};
const goVisible = () => {
  setVisibility('visible');
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('registerServiceWorker — transparent (hidden-reload) update strategy', () => {
  let reloadMock: ReturnType<typeof vi.fn>;
  let originalLocation: Location;
  // Track SUT-added listeners so a test that arms them but never fires them can't leak into the next.
  const tracked: Array<{ target: EventTarget; type: string; listener: EventListener }> = [];
  const realWindowAdd = window.addEventListener.bind(window);
  const realDocAdd = document.addEventListener.bind(document);

  beforeEach(() => {
    controllingHandlers.length = 0;
    waitingHandlers.length = 0;
    constructorCalls.length = 0;
    registerResult = {};
    wbRegister.mockClear();
    wbUpdate.mockClear();
    wbMessageSkipWaiting.mockClear();
    sessionStorage.clear();
    setVisibility('visible');

    tracked.length = 0;
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, opts) => {
      if (type === 'vite:preloadError' || type === 'pagehide') tracked.push({ target: window, type, listener: listener as EventListener });
      return realWindowAdd(type, listener as EventListener, opts);
    });
    vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, opts) => {
      if (type === 'visibilitychange') tracked.push({ target: document, type, listener: listener as EventListener });
      return realDocAdd(type, listener as EventListener, opts);
    });

    reloadMock = vi.fn();
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });

    // jsdom doesn't expose `navigator.serviceWorker`; the SUT's guard would
    // otherwise short-circuit. Any object satisfies the `in` check.
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });

    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_MOCK_GRID_API', 'false');
    vi.stubEnv('VITE_MOCK_GAME_API', 'false');

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    for (const { target, type, listener } of tracked) target.removeEventListener(type, listener);
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it("passes updateViaCache: 'none' to the Workbox registration", () => {
    registerServiceWorker();

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]!.scriptUrl).toBe('/sw.js');
    expect(constructorCalls[0]!.options).toMatchObject({ updateViaCache: 'none' });
  });

  it('does NOT skip-waiting while the tab is visible when a new SW is waiting', () => {
    registerServiceWorker();

    fireWaiting();

    expect(wbMessageSkipWaiting).not.toHaveBeenCalled();
  });

  it('skips-waiting once the tab becomes hidden after an update is waiting', () => {
    registerServiceWorker();

    fireWaiting();
    goHidden();

    expect(wbMessageSkipWaiting).toHaveBeenCalledTimes(1);
  });

  it('skips-waiting immediately if the tab is already hidden when the update arrives', () => {
    setVisibility('hidden');
    registerServiceWorker();

    fireWaiting();

    expect(wbMessageSkipWaiting).toHaveBeenCalledTimes(1);
  });

  it('reloads once after the new SW takes control, but only post skip-waiting', () => {
    registerServiceWorker();

    fireWaiting();
    goHidden();
    expect(reloadMock).not.toHaveBeenCalled();

    fireControlling();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('does not reload on the initial-install controlling (no update pending)', () => {
    registerServiceWorker();

    fireControlling();

    expect(wbMessageSkipWaiting).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('does not reload while the tab is visible even after controlling — a background tab must not refresh this one', () => {
    registerServiceWorker();

    // Another tab activated the new SW: controlling fires here without our skip-waiting.
    fireControlling();

    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('handles a SW already waiting at register time — skips-waiting when hidden', async () => {
    registerResult = { waiting: {} };
    registerServiceWorker();
    await Promise.resolve();
    await Promise.resolve();

    expect(wbMessageSkipWaiting).not.toHaveBeenCalled();

    goHidden();
    expect(wbMessageSkipWaiting).toHaveBeenCalledTimes(1);
  });

  it('sends skip-waiting only once even as visibility toggles repeatedly', () => {
    registerServiceWorker();

    fireWaiting();
    goHidden();
    goVisible();
    goHidden();

    expect(wbMessageSkipWaiting).toHaveBeenCalledTimes(1);
  });

  it('applies a mid-session update on pagehide (tab close / bfcache)', () => {
    registerServiceWorker();

    fireWaiting();
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));

    expect(wbMessageSkipWaiting).toHaveBeenCalledTimes(1);
  });

  // two microtask ticks needed: finally() on wb.update() settles asynchronously
  it('updates the SW then reloads once on vite:preloadError', async () => {
    registerServiceWorker();
    window.dispatchEvent(new Event('vite:preloadError'));
    await Promise.resolve();
    await Promise.resolve();
    expect(wbUpdate).toHaveBeenCalledTimes(1);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('suppresses a second preloadError within the reload window', async () => {
    registerServiceWorker();
    window.dispatchEvent(new Event('vite:preloadError'));
    await Promise.resolve();
    await Promise.resolve();
    expect(reloadMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(9000);
    window.dispatchEvent(new Event('vite:preloadError'));
    await Promise.resolve();
    await Promise.resolve();
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(wbUpdate).toHaveBeenCalledTimes(1);
  });

  it('allows a reload again after the window elapses', async () => {
    registerServiceWorker();
    window.dispatchEvent(new Event('vite:preloadError'));
    await Promise.resolve();
    await Promise.resolve();
    expect(reloadMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(11_000);
    window.dispatchEvent(new Event('vite:preloadError'));
    await Promise.resolve();
    await Promise.resolve();
    expect(wbUpdate).toHaveBeenCalledTimes(2);
  });

  it('skips registration when VITE_MOCK_GRID_API is true', () => {
    vi.stubEnv('VITE_MOCK_GRID_API', 'true');
    registerServiceWorker();
    expect(constructorCalls).toHaveLength(0);
  });

  it('skips registration when VITE_MOCK_GAME_API is true', () => {
    vi.stubEnv('VITE_MOCK_GAME_API', 'true');
    registerServiceWorker();
    expect(constructorCalls).toHaveLength(0);
  });
});
