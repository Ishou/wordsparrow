// Sync orchestrator (ADR-0075 Wave 3). Local `soloEntriesStore` stays the
// render source + offline cache; this is a background side-channel that
// reconciles local with the identity-owned blob when authed. Anon/offline is a
// no-op — the orchestrator is only ever started from the authed state.

import { mergeProgress } from './mergeProgress';
import type { ProgressSyncClient } from './ProgressSyncClient';
import type { SoloProgressBlobStore } from './SoloProgressBlobStore';
import {
  coerceSoloStorePayload,
  type SoloStorePayload,
} from './SoloStorePayload';

export interface ProgressSyncServiceDeps {
  readonly client: ProgressSyncClient;
  readonly blobStore: SoloProgressBlobStore;
  readonly getSessionId: () => string;
  readonly debounceMs?: number;
  readonly maxConflictRetries?: number;
  // Injectable timers so tests drive the debounce deterministically.
  readonly setTimeout?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface ProgressSyncService {
  // Gates the debounced push path. Anon/offline keeps this false → no network,
  // unchanged local-only behaviour. The authed hook flips it true.
  setEnabled(enabled: boolean): void;
  // Batch-pull, merge each into local, push the merged blob back. Authed only.
  pullAndMergeAll(): Promise<void>;
  // Debounced single-puzzle push after a local mutation; no-op when disabled.
  schedulePush(puzzleId: string): void;
  // Push every local puzzle now (anon→authed carry-over).
  carryOver(anonSessionId: string): Promise<void>;
  // Cancels pending debounce timers (e.g. on sign-out / unmount).
  dispose(): void;
}

const DEFAULT_DEBOUNCE_MS = 1500;
const DEFAULT_MAX_CONFLICT_RETRIES = 3;

export function createProgressSyncService(
  deps: ProgressSyncServiceDeps,
): ProgressSyncService {
  const { client, blobStore, getSessionId } = deps;
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const maxRetries = deps.maxConflictRetries ?? DEFAULT_MAX_CONFLICT_RETRIES;
  const schedule = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = deps.clearTimeout ?? ((h) => clearTimeout(h));

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
        : { entries: [], lockedCells: [], hintsUsed: 0 };
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

  return {
    setEnabled(next: boolean): void {
      enabled = next;
    },

    async pullAndMergeAll(): Promise<void> {
      const sessionId = getSessionId();
      const remoteEntries = await client.pullAll();
      const seen = new Set<string>();
      for (const remote of remoteEntries) {
        seen.add(remote.puzzleId);
        baseUpdatedAt.set(remote.puzzleId, remote.updatedAt);
        const localPayload = blobStore.loadPayload(sessionId, remote.puzzleId);
        const merged = mergeProgress(
          { payload: localPayload },
          { payload: coerceSoloStorePayload(remote.payload), updatedAt: remote.updatedAt },
        );
        blobStore.replacePayload(sessionId, remote.puzzleId, merged);
      }
      // Local-only puzzles the account never saw: push them up so the union holds.
      for (const puzzleId of blobStore.listPuzzleIds(sessionId)) {
        if (seen.has(puzzleId)) continue;
        await pushPuzzle(sessionId, puzzleId);
      }
      // Push the merged blobs back so the server reflects the union.
      for (const puzzleId of seen) {
        await pushPuzzle(sessionId, puzzleId);
      }
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

    async carryOver(anonSessionId: string): Promise<void> {
      for (const puzzleId of blobStore.listPuzzleIds(anonSessionId)) {
        await pushPuzzle(anonSessionId, puzzleId);
      }
    },

    dispose(): void {
      for (const handle of timers.values()) cancel(handle);
      timers.clear();
    },
  };
}
