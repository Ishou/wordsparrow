// Application-layer port for the identity progress-sync endpoints (ADR-0075 §3).
// ui/ and the orchestrator depend on this; the generated client stays in
// infrastructure/.

export interface RemoteProgressEntry {
  readonly puzzleId: string;
  readonly payload: { readonly [key: string]: unknown };
  readonly updatedAt: string;
}

export type PushResult =
  | { readonly kind: 'ok'; readonly updatedAt: string }
  // 409: the push was built on a stale read — re-pull, re-merge, re-push.
  | { readonly kind: 'conflict' };

export interface ProgressSyncClient {
  pullAll(): Promise<ReadonlyArray<RemoteProgressEntry>>;
  // null when the user has no row for this puzzle (404).
  pull(puzzleId: string): Promise<RemoteProgressEntry | null>;
  push(
    puzzleId: string,
    payload: { readonly [key: string]: unknown },
    baseUpdatedAt?: string,
  ): Promise<PushResult>;
}
