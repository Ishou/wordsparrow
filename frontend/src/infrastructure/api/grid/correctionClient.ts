// HTTP adapter for the grid corrections surface (ADR-0108); credentials per call since these routes read the maintainer session cookie.

import type { ClientOptions } from 'openapi-fetch';
import type { CorrectionAccepted, CorrectionClient, CorrectionInput, CorrectionProgress } from '@/application/correction';
import { LastClueForbidden } from '@/application/correction';
import { createGridApiClient } from './client';
import type { components } from './types';

export interface GridCorrectionClientOptions {
  readonly baseUrl: string;
  readonly fetch?: ClientOptions['fetch'];
}

function toRequestBody(input: CorrectionInput): components['schemas']['CorrectionRequest'] {
  if (input.kind === 'replace') {
    return {
      kind: 'replace',
      oldClueText: input.oldClueText,
      newClueText: input.newClueText,
      ...(input.wordText ? { wordText: input.wordText } : {}),
    };
  }
  return { kind: 'forbid_clue', oldClueText: input.oldClueText, wordText: input.wordText };
}

export function createGridCorrectionClient(options: GridCorrectionClientOptions): CorrectionClient {
  // Resolve fetch at call time so MSW `.listen()` interception takes effect (openapi-fetch otherwise binds it at creation).
  const fetchImpl: ClientOptions['fetch'] = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const client = createGridApiClient({ baseUrl: options.baseUrl, fetch: fetchImpl });

  const submitCorrection: CorrectionClient['submitCorrection'] = async (input) => {
    const { data, response } = await client.POST('/v1/corrections', {
      body: toRequestBody(input),
      credentials: 'include',
    });
    if (response.status === 409) throw new LastClueForbidden();
    if (!data) throw new Error(`submitCorrection failed: ${response.status}`);
    return { correctionId: data.correctionId, backfillStatus: data.backfillStatus } satisfies CorrectionAccepted;
  };

  const getCorrectionProgress: CorrectionClient['getCorrectionProgress'] = async (correctionId) => {
    const { data, response } = await client.GET('/v1/corrections/{correctionId}', {
      params: { path: { correctionId } },
      credentials: 'include',
    });
    if (!data) throw new Error(`getCorrectionProgress failed: ${response.status}`);
    return {
      correctionId: data.correctionId,
      kind: data.kind,
      backfillStatus: data.backfillStatus,
      gridsMatched: data.gridsMatched,
      gridsPatched: data.gridsPatched,
    } satisfies CorrectionProgress;
  };

  return { submitCorrection, getCorrectionProgress };
}
