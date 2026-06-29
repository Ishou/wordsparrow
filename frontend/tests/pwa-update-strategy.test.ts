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

describe('registerServiceWorker — update strategy', () => {
  let reloadMock: ReturnType<typeof vi.fn>;
  let originalLocation: Location;
  // track vite:preloadError listeners to detach between tests, preventing stale-closure accumulation
  const addedListeners: Array<[string, EventListener]> = [];
  const realAdd = window.addEventListener.bind(window);

  beforeEach(() => {
    controllingHandlers.length = 0;
    waitingHandlers.length = 0;
    constructorCalls.length = 0;
    registerResult = {};
    wbRegister.mockClear();
    wbUpdate.mockClear();
    wbMessageSkipWaiting.mockClear();
    sessionStorage.clear();

    addedListeners.length = 0;
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, opts) => {
      if (type === 'vite:preloadError') addedListeners.push([type, listener as EventListener]);
      return realAdd(type, listener as EventListener, opts);
    });

    reloadMock = vi.fn();
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });

    // jsdom doesn't expose `navigator.serviceWorker`; the SUT's
    // `'serviceWorker' in navigator` guard would otherwise short-
    // circuit registration. Any object satisfies the check — the SUT
    // doesn't read into `navigator.serviceWorker`, only the workbox-
    // window mock does (and we stub that wholesale).
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });

    // Production-like env so the early-returns don't short-circuit
    // registration.
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_MOCK_GRID_API', 'false');
    vi.stubEnv('VITE_MOCK_GAME_API', 'false');

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const [type, listener] of addedListeners) {
      window.removeEventListener(type, listener);
    }
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it("passes updateViaCache: 'none' to the Workbox registration", () => {
    registerServiceWorker();

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]!.scriptUrl).toBe('/sw.js');
    expect(constructorCalls[0]!.options).toMatchObject({ updateViaCache: 'none' });
  });

  it('fires the update-available callback when a new SW starts waiting', () => {
    const onUpdate = vi.fn();
    registerServiceWorker(onUpdate);

    fireWaiting();

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('prompts only once even if waiting fires repeatedly', () => {
    const onUpdate = vi.fn();
    registerServiceWorker(onUpdate);

    fireWaiting();
    fireWaiting();

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('prompts for a SW that was already waiting at register time', async () => {
    registerResult = { waiting: {} };
    const onUpdate = vi.fn();
    registerServiceWorker(onUpdate);

    await Promise.resolve();
    await Promise.resolve();

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('does NOT reload when controlling fires before the user accepts', () => {
    registerServiceWorker(vi.fn());

    fireWaiting();
    fireControlling();

    expect(wbMessageSkipWaiting).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('activates the waiting SW and reloads once after the user accepts', () => {
    let apply: (() => void) | undefined;
    registerServiceWorker((a) => { apply = a; });

    fireWaiting();
    expect(apply).toBeTypeOf('function');
    apply!();

    expect(wbMessageSkipWaiting).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();

    fireControlling();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('does not reload twice when controlling fires repeatedly after accept', () => {
    let apply: (() => void) | undefined;
    registerServiceWorker((a) => { apply = a; });

    fireWaiting();
    apply!();
    fireControlling();
    fireControlling();

    expect(reloadMock).toHaveBeenCalledTimes(1);
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
    // Still within the 10s window — no second reload (and no second update).
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

  // Preview deploys set VITE_MOCK_GRID_API/VITE_MOCK_GAME_API='true' so
  // MSW's own service worker takes scope `/`. Registering Workbox here
  // would race MSW for that scope; the resulting `controlling` event
  // would fire reloadOnce() inside the fresh-load window, triggering an
  // infinite reload loop on every preview URL (regression caught on
  // https://11593b5f.bliss-cb4.pages.dev/ — page refreshed every ~1.5 s).
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
