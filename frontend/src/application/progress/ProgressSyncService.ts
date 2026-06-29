// Sync orchestrator: background side-channel that reconciles local with the identity-owned blob when authed (ADR-0075).

import { mergeProgress } from './mergeProgress';
import type { ProgressSyncClient } from './ProgressSyncClient';
import type { SoloProgressBlobStore } from './SoloProgressBlobStore';
import {
  coerceSoloStorePayload,
  EMPTY_PAYLOAD,
  payloadsEqual,
  type SoloStorePayload,
} from './SoloStorePayload';

// Persists which account this device last reconciled; see ADR-0075 for why in-memory isn't enough.
export interface ReconciledUserStore {
  load(): string | null;
  save(userId: string): void;
  clear(): void;
}

export interface ProgressSyncServiceDeps {
  readonly client: ProgressSyncClient;
  readonly blobStore: SoloProgressBlobStore;
  readonly getSessionId: () => string;
  readonly debounceMs?: number;
  readonly maxConflictRetries?: number;
  readonly reconciledStore?: ReconciledUserStore;
  // Gap between successive batch pushes; keeps a many-puzzle sync under the ingress rps cap.
  readonly pushPaceMs?: number;
  // Injectable timers so tests drive the debounce/pacing deterministically.
  readonly setTimeout?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
  readonly delay?: (ms: number) => Promise<void>;
}

export interface ProgressSyncService {
  // Anon/offline keeps this false → no network call; flipped true by the authed hook (ADR-0075).
  setEnabled(enabled: boolean): void;
  // Batch-pull, merge each into local, push only the blobs the server is missing or behind on.
  pullAndMergeAll(): Promise<void>;
  // Pull+merge one puzzle on grid-open; push back only if local adds something. No-op when disabled.
  pullAndMergeOne(puzzleId: string): Promise<void>;
  // Runs pullAndMergeAll once per account per device; no-op once this userId is reconciled.
  reconcileOnAuth(userId: string): Promise<void>;
  // Forgets the reconcile marker (sign-out) so a re-auth re-syncs.
  resetReconciled(): void;
  // Debounced single-puzzle push after a local mutation; no-op when disabled.
  schedulePush(puzzleId: string): void;
  // Cancels pending debounce timers (e.g. on sign-out / unmount).
  dispose(): void;
}

const DEFAULT_DEBOUNCE_MS = 1500;
const DEFAULT_MAX_CONFLICT_RETRIES = 3;
const DEFAULT_PUSH_PACE_MS = 250;

export function createProgressSyncService(
  deps: ProgressSyncServiceDeps,
): ProgressSyncService {
  const { client, blobStore, getSessionId, reconciledStore } = deps;
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const maxRetries = deps.maxConflictRetries ?? DEFAULT_MAX_CONFLICT_RETRIES;
  const pushPaceMs = deps.pushPaceMs ?? DEFAULT_PUSH_PACE_MS;
  const schedule = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = deps.clearTimeout ?? ((h) => clearTimeout(h));
  const delay =
    deps.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  // Last server-stamped updatedAt seen per puzzle, used as `baseUpdatedAt`.
  const baseUpdatedAt = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let enabled = false;

  async function pushPuzzle(sessionId: string, puzzleId: string): Promise<void> {
    let local = blobStore.loadPayload(sessionId, puzzleId);
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const result = await client.push(
        puzzleId,
        local as unknown as Record<string, unknown>,
        baseUpdatedAt.get(puzzleId),
      );
      if (result.kind === 'ok') {
        baseUpdatedAt.set(puzzleId, result.updatedAt);
        return;
      }
      // Conflict: re-pull, re-merge with current local, retry.
      const remote = await client.pull(puzzleId);
      const remotePayload: SoloStorePayload = remote
        ? coerceSoloStorePayload(remote.payload)
        : EMPTY_PAYLOAD;
      if (remote) baseUpdatedAt.set(puzzleId, remote.updatedAt);
      else baseUpdatedAt.delete(puzzleId);
      const currentLocal = blobStore.loadPayload(sessionId, puzzleId);
      const merged = mergeProgress(
        { payload: currentLocal },
        { payload: remotePayload, updatedAt: remote?.updatedAt },
      );
      blobStore.replacePayload(sessionId, puzzleId, merged);
      local = merged;
    }
  }

  // Pushes sequentially with a gap between each so a big batch can't burst past the ingress rps cap.
  async function pushPaced(sessionId: string, puzzleIds: readonly string[]): Promise<void> {
    for (let i = 0; i < puzzleIds.length; i += 1) {
      if (i > 0 && pushPaceMs > 0) await delay(pushPaceMs);
      await pushPuzzle(sessionId, puzzleIds[i]);
    }
  }

  async function pullAndMergeAll(): Promise<void> {
    const sessionId = getSessionId();
    const remoteEntries = await client.pullAll();
    const seen = new Set<string>();
    const toPush: string[] = [];
    for (const remote of remoteEntries) {
      seen.add(remote.puzzleId);
      baseUpdatedAt.set(remote.puzzleId, remote.updatedAt);
      const localPayload = blobStore.loadPayload(sessionId, remote.puzzleId);
      const remotePayload = coerceSoloStorePayload(remote.payload);
      const merged = mergeProgress(
        { payload: localPayload },
        { payload: remotePayload, updatedAt: remote.updatedAt },
      );
      blobStore.replacePayload(sessionId, remote.puzzleId, merged);
      // Skip the push when local added nothing the server lacks — the no-op storm.
      if (!payloadsEqual(merged, remotePayload)) toPush.push(remote.puzzleId);
    }
    // Local-only puzzles the account never saw: push them up so the union holds.
    for (const puzzleId of blobStore.listPuzzleIds(sessionId)) {
      if (!seen.has(puzzleId)) toPush.push(puzzleId);
    }
    await pushPaced(sessionId, toPush);
  }

  return {
    setEnabled(next: boolean): void {
      enabled = next;
    },

    pullAndMergeAll,

    async pullAndMergeOne(puzzleId: string): Promise<void> {
      if (!enabled) return;
      const sessionId = getSessionId();
      const remote = await client.pull(puzzleId);
      const remotePayload = remote ? coerceSoloStorePayload(remote.payload) : EMPTY_PAYLOAD;
      if (remote) baseUpdatedAt.set(puzzleId, remote.updatedAt);
      const merged = mergeProgress(
        { payload: blobStore.loadPayload(sessionId, puzzleId) },
        { payload: remotePayload, updatedAt: remote?.updatedAt },
      );
      blobStore.replacePayload(sessionId, puzzleId, merged);
      if (!remote || !payloadsEqual(merged, remotePayload)) {
        await pushPuzzle(sessionId, puzzleId);
      }
    },

    async reconcileOnAuth(userId: string): Promise<void> {
      if (reconciledStore?.load() === userId) return;
      await pullAndMergeAll();
      reconciledStore?.save(userId);
    },

    resetReconciled(): void {
      reconciledStore?.clear();
    },

    schedulePush(puzzleId: string): void {
      if (!enabled) return;
      const existing = timers.get(puzzleId);
      if (existing !== undefined) cancel(existing);
      const handle = schedule(() => {
        timers.delete(puzzleId);
        void pushPuzzle(getSessionId(), puzzleId);
      }, debounceMs);
      timers.set(puzzleId, handle);
    },

    dispose(): void {
      for (const handle of timers.values()) cancel(handle);
      timers.clear();
    },
  };
}
