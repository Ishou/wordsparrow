import { useEffect, useState } from 'react';
import type { CorrectionClient, CorrectionProgress } from '@/application/correction';

export interface CorrectionProgressState {
  readonly progress: CorrectionProgress | null;
  readonly error: boolean;
}

// Self-terminating poll: stops once the correction is done/failed so a settled correction stops hitting the network.
export function useCorrectionProgress(
  correctionClient: CorrectionClient,
  correctionId: string | null,
  intervalMs = 1500,
): CorrectionProgressState {
  const [progress, setProgress] = useState<CorrectionProgress | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!correctionId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await correctionClient.getCorrectionProgress(correctionId);
        if (!alive) return;
        setProgress(next);
        if (next.backfillStatus === 'done' || next.backfillStatus === 'failed') return;
        timer = setTimeout(() => void poll(), intervalMs);
      } catch {
        if (alive) setError(true);
      }
    };
    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [correctionClient, correctionId, intervalMs]);

  return { progress, error };
}
