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
import {
  loadSoloLocalUpdatedAt,
  loadSoloPayload,
  listSoloPuzzleIds,
  reconcileSoloFingerprint,
  replaceSoloPayload,
  saveSoloLetter,
  saveSoloLockedCell,
} from '@/infrastructure/session/localStorageSolo';

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
function memBlobStore(
  seed: Record<string, SoloStorePayload> = {},
  localTimes: Record<string, string> = {},
): SoloProgressBlobStore {
  const map = new Map<string, SoloStorePayload>(Object.entries(seed));
  const times = new Map<string, string>(Object.entries(localTimes));
  const hasData = (v: SoloStorePayload): boolean =>
    v.entries.length > 0 || v.lockedCells.length > 0 || v.hintsUsed > 0 || v.elapsedSeconds > 0;
  return {
    loadPayload: (s, p) => map.get(seedKey(s, p)) ?? payload({}),
    loadLocalUpdatedAt: (s, p) => times.get(seedKey(s, p)),
    replacePayload: (s, p, v) => {
      map.set(seedKey(s, p), v);
    },
    reconcileFingerprint: (s, p, fp) => {
      const cur = map.get(seedKey(s, p));
      if (cur && hasData(cur) && cur.fingerprint !== fp) {
        map.set(seedKey(s, p), payload({ fingerprint: fp }));
      } else {
        map.set(seedKey(s, p), { ...(cur ?? payload({})), fingerprint: fp });
      }
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

  it('carries the remote fingerprint forward so a never-locally-opened puzzle is not treated as legacy', async () => {
    const remoteEntry: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({
        entries: [{ r: 1, c: 1, l: 'B' }],
        fingerprint: 'fp-remote',
      }) as unknown as Record<string, unknown>,
      updatedAt: T1,
    };
    const client = fakeClient({ pullAll: [remoteEntry] });
    const blobStore = memBlobStore();
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
    });
    await service.pullAndMergeAll();

    const merged = blobStore.loadPayload(SESSION, PUZZLE);
    expect(merged.fingerprint).toBe('fp-remote');
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

  it('keeps a fresh local edit over a stale remote value on grid-open (P→O regression)', async () => {
    // Local typed P (at T2) but the debounced push never reached the server, which still holds an older O (at T1).
    const remote: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({ entries: [{ r: 0, c: 0, l: 'O' }] }) as unknown as Record<string, unknown>,
      updatedAt: T1,
    };
    const client = fakeClient({ pull: () => remote });
    const blobStore = memBlobStore(
      { [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 0, c: 0, l: 'P' }] }) },
      { [seedKey(SESSION, PUZZLE)]: T2 },
    );
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    service.setEnabled(true);
    await service.pullAndMergeOne(PUZZLE);

    const merged = blobStore.loadPayload(SESSION, PUZZLE);
    expect(merged.entries).toContainEqual({ r: 0, c: 0, l: 'P' });
    expect(merged.entries).not.toContainEqual({ r: 0, c: 0, l: 'O' });
    // The fresh edit differs from the server → it is pushed back up.
    expect(client.pushes).toHaveLength(1);
  });

  it('a same-device lock write does not poison an unrelated cell collision (cross-device regression)', async () => {
    // Device A types a stale letter at T1, then (still offline) locks an unrelated
    // cell at T2. A lock write must not bump the blob clock, or the T2 stamp would
    // beat a fresher remote letter that a second device pushed at T1.5.
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T1));
    saveSoloLetter(SESSION, PUZZLE, 0, 0, 'X');
    vi.setSystemTime(new Date(T2));
    saveSoloLockedCell(SESSION, PUZZLE, 3, 3);
    vi.useRealTimers();

    const realBlobStore: SoloProgressBlobStore = {
      loadPayload: loadSoloPayload,
      loadLocalUpdatedAt: loadSoloLocalUpdatedAt,
      replacePayload: replaceSoloPayload,
      reconcileFingerprint: reconcileSoloFingerprint,
      listPuzzleIds: listSoloPuzzleIds,
    };
    const T1_5 = '2026-06-28T10:30:00.000Z';
    const remote: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({ entries: [{ r: 0, c: 0, l: 'Y' }] }) as unknown as Record<string, unknown>,
      updatedAt: T1_5,
    };
    const client = fakeClient({ pull: () => remote });
    const service = createProgressSyncService({
      client,
      blobStore: realBlobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    service.setEnabled(true);
    await service.pullAndMergeOne(PUZZLE);

    const merged = loadSoloPayload(SESSION, PUZZLE);
    // Remote's T1.5 letter beats local's true T1 edit clock — the T2 lock write must not have masqueraded as the letter's freshness.
    expect(merged.entries).toContainEqual({ r: 0, c: 0, l: 'Y' });
    expect(merged.entries).not.toContainEqual({ r: 0, c: 0, l: 'X' });
    // The locked cell is untouched by the remote pull and stays locked regardless of timestamps.
    expect(merged.lockedCells).toContainEqual({ r: 3, c: 3 });
    window.localStorage.clear();
  });

  it('discards a stale-grid remote blob and heals the server with the clean local grid (ADR-0105)', async () => {
    // The server holds progress typed on the pre-regeneration grid (its fingerprint differs).
    const stale: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({
        entries: [{ r: 0, c: 0, l: 'X' }],
        fingerprint: 'old-grid',
      }) as unknown as Record<string, unknown>,
      updatedAt: T1,
    };
    const client = fakeClient({ pull: () => stale });
    const blobStore = memBlobStore(
      { [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 5, c: 5, l: 'S' }], fingerprint: 'new-grid' }) },
      { [seedKey(SESSION, PUZZLE)]: T2 },
    );
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    service.setEnabled(true);
    await service.pullAndMergeOne(PUZZLE, 'new-grid');

    const merged = blobStore.loadPayload(SESSION, PUZZLE);
    // The old grid's letter never merges in; only the current grid's progress survives.
    expect(merged.entries).toContainEqual({ r: 5, c: 5, l: 'S' });
    expect(merged.entries).not.toContainEqual({ r: 0, c: 0, l: 'X' });
    expect(merged.fingerprint).toBe('new-grid');
    // Clean local differs from the discarded remote → pushed up, overwriting the poisoned server row.
    expect(client.pushes).toHaveLength(1);
  });

  it('heals stale local progress even while disabled (anon) — local reconcile still runs', async () => {
    const client = fakeClient({ pull: () => null });
    const blobStore = memBlobStore({
      [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 0, c: 0, l: 'X' }], fingerprint: 'old-grid' }),
    });
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    // disabled (anon): no network, but the stale local grid must still be discarded before render.
    await service.pullAndMergeOne(PUZZLE, 'new-grid');

    expect(client.pulls).toHaveLength(0);
    const local = blobStore.loadPayload(SESSION, PUZZLE);
    expect(local.entries).toEqual([]);
    expect(local.fingerprint).toBe('new-grid');
  });

  it('keeps a matching-fingerprint remote blob (no false discard)', async () => {
    const remote: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({ entries: [{ r: 1, c: 1, l: 'B' }], fingerprint: 'g1' }) as unknown as Record<
        string,
        unknown
      >,
      updatedAt: T2,
    };
    const client = fakeClient({ pull: () => remote });
    const blobStore = memBlobStore({
      [seedKey(SESSION, PUZZLE)]: payload({ entries: [{ r: 0, c: 0, l: 'A' }], fingerprint: 'g1' }),
    });
    const service = createProgressSyncService({
      client,
      blobStore,
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    service.setEnabled(true);
    await service.pullAndMergeOne(PUZZLE, 'g1');

    const merged = blobStore.loadPayload(SESSION, PUZZLE);
    expect(merged.entries).toContainEqual({ r: 0, c: 0, l: 'A' });
    expect(merged.entries).toContainEqual({ r: 1, c: 1, l: 'B' });
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

  it('is a no-op when both local and remote have no progress', async () => {
    const client = fakeClient({ pull: () => null });
    const service = createProgressSyncService({
      client,
      blobStore: memBlobStore(),
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

describe('ProgressSyncService — merge-completion observable', () => {
  it('starts at revision 0 and notifies subscribers after pullAndMergeAll', async () => {
    const remoteEntry: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({ entries: [{ r: 1, c: 1, l: 'B' }] }) as unknown as Record<string, unknown>,
      updatedAt: T1,
    };
    const service = createProgressSyncService({
      client: fakeClient({ pullAll: [remoteEntry] }),
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    const seen: number[] = [];
    service.subscribe(() => seen.push(service.getRevision()));
    expect(service.getRevision()).toBe(0);

    await service.pullAndMergeAll();

    expect(seen).toEqual([1]);
    expect(service.getRevision()).toBe(1);
  });

  it('notifies after pullAndMergeOne', async () => {
    const remote: RemoteProgressEntry = {
      puzzleId: PUZZLE,
      payload: payload({ entries: [{ r: 1, c: 1, l: 'B' }] }) as unknown as Record<string, unknown>,
      updatedAt: T1,
    };
    const service = createProgressSyncService({
      client: fakeClient({ pull: () => remote }),
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    service.setEnabled(true);
    const fired = vi.fn();
    service.subscribe(fired);

    await service.pullAndMergeOne(PUZZLE);

    expect(fired).toHaveBeenCalledTimes(1);
    expect(service.getRevision()).toBe(1);
  });

  it('stops notifying after unsubscribe', async () => {
    const service = createProgressSyncService({
      client: fakeClient({ pullAll: [] }),
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    const fired = vi.fn();
    const unsubscribe = service.subscribe(fired);
    unsubscribe();

    await service.pullAndMergeAll();

    expect(fired).not.toHaveBeenCalled();
  });

  it('does not notify when pullAndMergeOne is a disabled no-op', async () => {
    const service = createProgressSyncService({
      client: fakeClient({ pull: () => null }),
      blobStore: memBlobStore(),
      getSessionId: () => SESSION,
      debounceMs: 0,
      pushPaceMs: 0,
    });
    const fired = vi.fn();
    service.subscribe(fired);

    await service.pullAndMergeOne(PUZZLE); // disabled → early return

    expect(fired).not.toHaveBeenCalled();
    expect(service.getRevision()).toBe(0);
  });
});
