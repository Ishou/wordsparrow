import type { SampleWord, SampleWordsOptions, WordsRepository } from '@/application';
import { createGridApiClient, type GridApiClient } from './client';

// HTTP adapter for the application-layer `WordsRepository` port. Wraps
// `createGridApiClient`, lifting RFC 7807 problem bodies into a flat
// `Error.message`. Per ADR-0002 §7 only this layer may import the
// generated client; the composition root (`main.tsx`) constructs an
// instance and threads it through the router context.
export interface HttpWordsRepositoryOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function createHttpWordsRepository(
  options: HttpWordsRepositoryOptions | { readonly client: GridApiClient },
): WordsRepository {
  const client =
    'client' in options
      ? options.client
      : createGridApiClient({ baseUrl: options.baseUrl, fetch: options.fetch });

  return {
    async fetchSampleWords(opts: SampleWordsOptions = {}): Promise<ReadonlyArray<SampleWord>> {
      const query: { minLen?: number; maxLen?: number; count?: number } = {};
      if (opts.minLen != null) query.minLen = opts.minLen;
      if (opts.maxLen != null) query.maxLen = opts.maxLen;
      if (opts.count != null) query.count = opts.count;
      const { data, error, response } = await client.GET('/v1/words/sample', {
        params: { query },
      });
      if (error) {
        const detail = error.detail ?? error.title ?? `HTTP ${response.status}`;
        throw new Error(`sample words fetch failed: ${detail}`);
      }
      return data.map((w) => ({ clue: w.clue, answer: w.answer }));
    },
  };
}
