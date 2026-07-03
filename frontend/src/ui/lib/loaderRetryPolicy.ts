// Auto-retry budget for a route loader that failed transiently — one module-level instance per route survives the errorComponent's remount-per-attempt.

export interface LoaderRetryDecision {
  readonly delayMs: number;
  // Instant first retry: render nothing new — a one-shot dropped request must recover invisibly.
  readonly silent: boolean;
  // 1-indexed; lets the UI announce once on attempt 2 (first loud), never per attempt.
  readonly attempt: number;
}

export interface LoaderRetryPolicy {
  // Consume the next auto-retry; `null` once the budget is spent (rest at the manual « Réessayer » CTA).
  next(now?: number): LoaderRetryDecision | null;
  reset(): void;
}

export interface LoaderRetryPolicyOptions {
  readonly firstBackoffMs?: number;
  readonly maxDelayMs?: number;
  readonly maxAutoRetries?: number;
  // A failure this long after the previous one is a NEW incident.
  readonly incidentResetMs?: number;
  // Calls this close together are the same mount (React StrictMode double-effect) — replay the decision instead of consuming twice.
  readonly dedupWindowMs?: number;
}

const DEFAULT_FIRST_BACKOFF_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8_000;
const DEFAULT_MAX_AUTO_RETRIES = 6;
const DEFAULT_INCIDENT_RESET_MS = 30_000;
const DEFAULT_DEDUP_WINDOW_MS = 50;

export function createLoaderRetryPolicy(
  options: LoaderRetryPolicyOptions = {},
): LoaderRetryPolicy {
  const firstBackoffMs = options.firstBackoffMs ?? DEFAULT_FIRST_BACKOFF_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const maxAutoRetries = options.maxAutoRetries ?? DEFAULT_MAX_AUTO_RETRIES;
  const incidentResetMs = options.incidentResetMs ?? DEFAULT_INCIDENT_RESET_MS;
  const dedupWindowMs = options.dedupWindowMs ?? DEFAULT_DEDUP_WINDOW_MS;

  let attempts = 0;
  let lastCallAt: number | null = null;
  let lastDecision: LoaderRetryDecision | null = null;

  return {
    next(now = Date.now()): LoaderRetryDecision | null {
      if (lastCallAt !== null && now - lastCallAt < dedupWindowMs) {
        return lastDecision;
      }
      if (lastCallAt !== null && now - lastCallAt > incidentResetMs) {
        attempts = 0;
      }
      lastCallAt = now;
      if (attempts >= maxAutoRetries) {
        lastDecision = null;
        return null;
      }
      attempts += 1;
      lastDecision =
        attempts === 1
          ? { delayMs: 0, silent: true, attempt: 1 }
          : {
              delayMs: Math.min(firstBackoffMs * 2 ** (attempts - 2), maxDelayMs),
              silent: false,
              attempt: attempts,
            };
      return lastDecision;
    },

    reset() {
      attempts = 0;
      lastCallAt = null;
      lastDecision = null;
    },
  };
}
