import { describe, expect, it } from 'vitest';
import { createLoaderRetryPolicy } from '@/ui/lib/loaderRetryPolicy';

describe('createLoaderRetryPolicy', () => {
  it('grants an instant, silent first retry, then loud capped backoff', () => {
    const policy = createLoaderRetryPolicy();
    let now = 1_000;
    expect(policy.next(now)).toEqual({ delayMs: 0, silent: true, attempt: 1 });
    now += 200;
    expect(policy.next(now)).toEqual({ delayMs: 500, silent: false, attempt: 2 });
    now += 700;
    expect(policy.next(now)).toEqual({ delayMs: 1000, silent: false, attempt: 3 });
    now += 1200;
    expect(policy.next(now)).toEqual({ delayMs: 2000, silent: false, attempt: 4 });
    now += 2200;
    expect(policy.next(now)).toEqual({ delayMs: 4000, silent: false, attempt: 5 });
    now += 4200;
    expect(policy.next(now)).toEqual({ delayMs: 8000, silent: false, attempt: 6 });
    now += 8200;
    // 6 auto-retries consumed — rest at the manual « Réessayer » CTA.
    expect(policy.next(now)).toBeNull();
    now += 200;
    expect(policy.next(now)).toBeNull();
  });

  it('returns the same decision without consuming inside the dedup window (StrictMode double-effect)', () => {
    const policy = createLoaderRetryPolicy();
    const first = policy.next(1_000);
    const replay = policy.next(1_020);
    expect(replay).toEqual(first);
    // The next real call still gets attempt 2, not attempt 3.
    expect(policy.next(2_000)).toEqual({ delayMs: 500, silent: false, attempt: 2 });
  });

  it('treats a failure after a quiet period as a fresh incident (silent instant retry again)', () => {
    const policy = createLoaderRetryPolicy();
    policy.next(1_000);
    policy.next(2_000);
    // 5 minutes later — new incident, full budget back.
    expect(policy.next(302_000)).toEqual({ delayMs: 0, silent: true, attempt: 1 });
  });

  it('reset() restores the full budget immediately', () => {
    const policy = createLoaderRetryPolicy();
    policy.next(1_000);
    policy.next(2_000);
    policy.next(4_000);
    policy.reset();
    expect(policy.next(5_000)).toEqual({ delayMs: 0, silent: true, attempt: 1 });
  });

  it('honors custom bounds', () => {
    const policy = createLoaderRetryPolicy({
      firstBackoffMs: 100,
      maxDelayMs: 150,
      maxAutoRetries: 3,
    });
    expect(policy.next(1_000)).toEqual({ delayMs: 0, silent: true, attempt: 1 });
    expect(policy.next(2_000)).toEqual({ delayMs: 100, silent: false, attempt: 2 });
    expect(policy.next(3_000)).toEqual({ delayMs: 150, silent: false, attempt: 3 });
    expect(policy.next(4_000)).toBeNull();
  });
});
