// HTTP adapter for the ProgressSyncClient port (ADR-0075 §3).
import type {
  ProgressSyncClient,
  PushResult,
  RemoteProgressEntry,
} from '@/application/progress/ProgressSyncClient';
import { createIdentityApiClient, type IdentityApiClient } from './client';

export interface HttpProgressSyncClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function createHttpProgressSyncClient(
  options:
    | HttpProgressSyncClientOptions
    | { readonly baseUrl: string; readonly client: IdentityApiClient },
): ProgressSyncClient {
  const client =
    'client' in options
      ? options.client
      : createIdentityApiClient({ baseUrl: options.baseUrl, fetch: options.fetch });

  return {
    async pullAll(): Promise<ReadonlyArray<RemoteProgressEntry>> {
      const { data, error, response } = await client.GET('/v1/users/me/progress', {
        credentials: 'include',
      });
      if (error) {
        const detail = error.detail ?? error.title ?? `HTTP ${response.status}`;
        throw new Error(`pullAll progress failed: ${detail}`);
      }
      return data.items;
    },

    async pull(puzzleId: string): Promise<RemoteProgressEntry | null> {
      const { data, error, response } = await client.GET(
        '/v1/users/me/progress/{puzzleId}',
        { params: { path: { puzzleId } }, credentials: 'include' },
      );
      if (response.status === 404) return null;
      if (error) {
        const detail = error.detail ?? error.title ?? `HTTP ${response.status}`;
        throw new Error(`pull progress failed: ${detail}`);
      }
      return data;
    },

    async push(
      puzzleId: string,
      payload: { readonly [key: string]: unknown },
      baseUpdatedAt?: string,
    ): Promise<PushResult> {
      const { data, error, response } = await client.PUT(
        '/v1/users/me/progress/{puzzleId}',
        {
          params: { path: { puzzleId } },
          credentials: 'include',
          body: { payload: payload as Record<string, unknown>, baseUpdatedAt },
        },
      );
      if (response.status === 409) return { kind: 'conflict' };
      if (error) {
        const detail = error.detail ?? error.title ?? `HTTP ${response.status}`;
        throw new Error(`push progress failed: ${detail}`);
      }
      return { kind: 'ok', updatedAt: data.updatedAt };
    },
  };
}
