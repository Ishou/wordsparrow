import { useEffect, useState } from 'react';

// Cosmetic 1-Hz countdown seeded from a server value; display only, the server stays source of truth (regen spec §D).
export function useCountdownTicker(seed: number | null): number | null {
  const [seconds, setSeconds] = useState<number | null>(seed);

  useEffect(() => {
    setSeconds(seed);
    if (seed === null || seed <= 0) return;
    const id = window.setInterval(() => {
      setSeconds((current) => {
        if (current === null || current <= 1) {
          window.clearInterval(id);
          return current === null ? null : 0;
        }
        return current - 1;
      });
    }, 1_000);
    return () => window.clearInterval(id);
  }, [seed]);

  return seconds;
}
