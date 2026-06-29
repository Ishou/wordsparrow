import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProgressSyncService,
  type ProgressSyncClient,
  type PushResult,
  type ReconciledUserStore,
  type RemoteProgressEntry,
  type SoloProgressBlobStore,
  type SoloStorePayload,
} from '@/application/progress';

function memReconciledStore(initial: string | null = null): ReconciledUserStore {
  let value = initial;
  return {
    load: () => value,
    save: (id) => {
      value = id;
    },
    clear: () => {
      value = null;
    },
  };
}

const SESSION = 'anon-session-1';
const PUZZLE = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';
const T1 = '2026-06-28T10:00:00.000Z';
const T2 = '2026-06-28T11:00:00.000Z';

function payload(p: Partial<SoloStorePayload>): SoloStorePayload {
  return { entries: [], lockedCells: [], hintsUsed: 0, elapsedSeconds: 0, ...p };
}

const SEP = '::';
const seedKey = (s: string, p: string): string => `${s}${SEP}${p}`;

// In-memory blob store keyed by `sessionId::puzzleId` (real impl, not a mock).
function memBlobStore(seed: Record<string, SoloStorePayload> = {}): SoloProgressBlobStore {
  const map = new Map<string, SoloStorePayload>(Object.entries(seed));
  return {
    loadPayload: (s, p) => map.get(seedKey(s, p)) ?? payload({}),
    replacePayload: (s, p, v) => {
      map.set(seedKey(s, p), v);
    },
    listPuzzleIds: (s) =>
      [...map.keys()]
        .filter((key) => key.startsWith(`${s}${SEP}`))
        .map((key) => key.slice(s.length + SEP.length)),
  };
}

interface FakeClient extends ProgressSyncClient {
  readonly pushes: Array<{ puzzleId: string; payload: unknown; baseUpdatedAt?: string }>;
  readonly pulls: string[];
  pullAllCount: number;
}

function fakeClient(opts: {
  pullAll?: ReadonlyArray<RemoteProgressEntry>;
  pull?: (puzzleId: string) => RemoteProgressEntry | null;
  push?: (n: number) => PushResult;
}): FakeClient {
  const pushes: FakeClient['pushes'] = [];
  const pulls: string[] = [];
  let pushN = 0;
  return {
    pushes,
    pulls,
    pullAllCount: 0,
    async pullAll() {
      this.pullAllCount += 1;
      return opts.pullAll ?? [];
    },
    async pull(puzzleId) {
      pulls.push(puzzleId);
      return opts.pull ? opts.pull(puzzleId) : null;
    },
    async push(puzzleId, payloadArg, baseUpdatedAt) {
      pushes.push({ puzzleId, payload: payloadArg, baseUpdatedAt });
      pushN += 1;
      return opts.push ? opts.push(pushN) : { kind: 'ok', updatedAt: T2 };
    },
  };
}

describe('ProgressSyncService — disabled (anon/offline) path', () => {
  it('schedulePush is a no-op while disabled', () => {
    const client = fakeClient({});
    const service = createProgressSyncService({
      client,
      blobStore: memBlobStore({ [seedKey(SESSION, PUZZLE)]: payload({ hintsUsed: 1 }) }),
      getSessionId: () => SESSION,
      debounceMs: 0,
    });
    service.schedulePush(PUZZLE);
    expect(client.pushes).toHaveLength(0);
  });
});

describe('ProgressSyncService — debounced push on mutation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('coalesces rapid mutations into one push after the debounce window', async () => {
    const client = fakeClient({});
    const service = createProgressSyncService({
      client,
      blobStore: memBlobStore({
        [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }),
      }),
      getSessionId: () => SESSION,
      debounceMs: 1500,
    });
    service.setEnabled(true);
    service.schedulePush(PUZZLE);
    service.schedulePush(PUZZLE);
    service.schedulePush(PUZZLE);
    expect(client.pushes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1500);
    expect(client.pushes).toHaveLength(1);
    expect(client.pushes[0].puzzleId).toBe(PUZZLE);
    vi.useRealTimers();
  });
});

describe('ProgressSyncService — 409 conflict re-pull/re-merge/re-push', () => {
  it('re-pulls, merges, and re-pushes on a stale-base conflict', async () => {
    const remote: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({ entries: [{ r: 1, c: 1, l: 'B' }] }) as unknown as Record<string, unknown>,
      updatedAt: T2,
    };
    const client = fakeClient({
      pull: () => remote,
      push: (n) => (n === 1 ? { kind: 'conflict' } : { kind: 'ok', updatedAt: T2 }),
    });
    const blobStore = memBlobStore({
      [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }),
    });
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    service.setEnabled(true);
    await service.pullAndMergeAll(); // local-only push path, exercises the conflict loop

    expect(client.pulls).toEqual([PUZZLE]);
    expect(client.pushes).toHaveLength(2);
    // After merge, local holds the union of both letters.
    const merged = blobStore.loadPayload(SESSION, PUZZLE);
    expect(merged.entries).toContainEqual({ r: 0, c: 0, l: 'A' });
    expect(merged.entries).toContainEqual({ r: 1, c: 1, l: 'B' });
    // Second push carries the re-pulled base timestamp.
    expect(client.pushes[1].baseUpdatedAt).toBe(T2);
  });
});

describe('ProgressSyncService — pullAndMergeAll', () => {
  it('merges remote entries into local and pushes the union back', async () => {
    const remoteEntry: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({ entries: [{ r: 1, c: 1, l: 'B' }], hintsUsed: 2 }) as unknown as Record<
        string,
        unknown
      >,
      updatedAt: T1,
    };
    const client = fakeClient({ pullAll: [remoteEntry] });
    const blobStore = memBlobStore({
      [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 0, c: 0, l: 'A' }], hintsUsed: 1 }),
    });
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
    });
    await service.pullAndMergeAll();

    const merged = blobStore.loadPayload(SESSION, PUZZLE);
    expect(merged.entries).toContainEqual({ r: 0, c: 0, l: 'A' });
    expect(merged.entries).toContainEqual({ r: 1, c: 1, l: 'B' });
    expect(merged.hintsUsed).toBe(2);
    // The merged blob is pushed back so the server reflects the union.
    expect(client.pushes).toHaveLength(1);
    expect(client.pushes[0].baseUpdatedAt).toBe(T1);
  });

  it('pushes a local-only puzzle the account never saw', async () => {
    const client = fakeClient({ pullAll: [] });
    const blobStore = memBlobStore({
      [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }),
    });
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
    });
    await service.pullAndMergeAll();
    expect(client.pushes).toHaveLength(1);
    expect(client.pushes[0].puzzleId).toBe(PUZZLE);
    expect(client.pushes[0].baseUpdatedAt).toBeUndefined();
  });
});

describe('ProgressSyncService — pullAndMergeAll pushes every local-only puzzle', () => {
  it('carries up all puzzles the account never saw', async () => {
    const client = fakeClient({ pullAll: [] });
    const other = '0190e3a4-7a2c-7c9e-8f1a-000000000002';
    const blobStore = memBlobStore({
      [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }),
      [seedKey(SESSION, other)]: payload({ hintsUsed: 1 }),
    });
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    await service.pullAndMergeAll();
    expect(client.pushes.map((p) => p.puzzleId).sort()).toEqual([other, PUZZLE].sort());
  });
});

describe('ProgressSyncService — dirty-check skips no-op pushes', () => {
  it('does not push a remote puzzle whose merge equals the server blob', async () => {
    const same = payload({ entries: [{ r: 0, c: 0, l: 'A' }], hintsUsed: 1 });
    const remoteEntry: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: same as unknown as Record<string, unknown>,
      updatedAt: T1,
    };
    const client = fakeClient({ pullAll: [remoteEntry] });
    const blobStore = memBlobStore({ [seedKey(SESSION, PUZZLE)]: same });
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    await service.pullAndMergeAll();
    expect(client.pushes).toHaveLength(0);
  });
});

describe('ProgressSyncService — paces batch pushes', () => {
  it('delays between successive pushes to stay under the ingress rate limit', async () => {
    const client = fakeClient({ pullAll: [] });
    const p2 = '0190e3a4-7a2c-7c9e-8f1a-000000000002';
    const blobStore = memBlobStore({
      [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }),
      [seedKey(SESSION, p2)]: payload({ entries: [{ r: 1, c: 1, l: 'B' }] }),
    });
    const delay = vi.fn(async () => {});
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 250,
      delay,
    });
    await service.pullAndMergeAll();
    expect(client.pushes).toHaveLength(2);
    // One inter-push gap for two pushes; none before the first.
    expect(delay).toHaveBeenCalledTimes(1);
    expect(delay).toHaveBeenCalledWith(250);
  });
});

describe('ProgressSyncService — reconcileOnAuth marker gate', () => {
  it('reconciles once per account on a device, then no-ops on reload', async () => {
    const client = fakeClient({ pullAll: [] });
    const store = memReconciledStore();
    const service = createProgressSyncService({
      client,
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
      reconciledStore: store,
    });
    await service.reconcileOnAuth('user-A');
    await service.reconcileOnAuth('user-A');
    expect(client.pullAllCount).toBe(1);
    expect(store.load()).toBe('user-A');
  });

  it('reconciles again for a different account (account switch)', async () => {
    const client = fakeClient({ pullAll: [] });
    const service = createProgressSyncService({
      client,
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
      reconciledStore: memReconciledStore('user-A'),
    });
    await service.reconcileOnAuth('user-A'); // already marked → skip
    await service.reconcileOnAuth('user-B'); // new account → run
    expect(client.pullAllCount).toBe(1);
  });

  it('re-reconciles after resetReconciled (re-sign-in)', async () => {
    const client = fakeClient({ pullAll: [] });
    const store = memReconciledStore();
    const service = createProgressSyncService({
      client,
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
      reconciledStore: store,
    });
    await service.reconcileOnAuth('user-A');
    service.resetReconciled();
    expect(store.load()).toBeNull();
    await service.reconcileOnAuth('user-A');
    expect(client.pullAllCount).toBe(2);
  });
});

describe('ProgressSyncService — pullAndMergeOne (per-grid open)', () => {
  it('is a no-op while disabled (anon/offline)', async () => {
    const client = fakeClient({ pull: () => null });
    const service = createProgressSyncService({
      client,
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    await service.pullAndMergeOne(PUZZLE);
    expect(client.pulls).toHaveLength(0);
    expect(client.pushes).toHaveLength(0);
  });

  it('merges the remote blob into local for one puzzle', async () => {
    const remote: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({ entries: [{ r: 1, c: 1, l: 'B' }] }) as unknown as Record<string, unknown>,
      updatedAt: T2,
    };
    const client = fakeClient({ pull: () => remote });
    const blobStore = memBlobStore({
      [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }),
    });
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    service.setEnabled(true);
    await service.pullAndMergeOne(PUZZLE);

    expect(client.pulls).toEqual([PUZZLE]);
    const merged = blobStore.loadPayload(SESSION, PUZZLE);
    expect(merged.entries).toContainEqual({ r: 0, c: 0, l: 'A' });
    expect(merged.entries).toContainEqual({ r: 1, c: 1, l: 'B' });
    // Local added 'A', which the server lacked → push the union back.
    expect(client.pushes).toHaveLength(1);
    expect(client.pushes[0].baseUpdatedAt).toBe(T2);
  });

  it('does not push when local adds nothing the server lacks', async () => {
    const same = payload({ entries: [{ r: 0, c: 0, l: 'A' }] });
    const remote: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: same as unknown as Record<string, unknown>,
      updatedAt: T2,
    };
    const client = fakeClient({ pull: () => remote });
    const blobStore = memBlobStore({ [seedKey(SESSION, PUZZLE)]: same });
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    service.setEnabled(true);
    await service.pullAndMergeOne(PUZZLE);
    expect(client.pushes).toHaveLength(0);
  });

  it('pushes local up when the account has no remote blob yet', async () => {
    const client = fakeClient({ pull: () => null });
    const blobStore = memBlobStore({
      [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 0, c: 0, l: 'A' }] }),
    });
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    service.setEnabled(true);
    await service.pullAndMergeOne(PUZZLE);
    expect(client.pushes).toHaveLength(1);
    expect(client.pushes[0].baseUpdatedAt).toBeUndefined();
  });
});
