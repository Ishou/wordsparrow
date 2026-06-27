import { useEffect, useState } from 'react';

// Returns true only once `active` has stayed true for `delayMs`. Used to gate loading
// skeletons: a fast async response resolves before the timer fires, so a quick load never
// flashes a skeleton. Resets immediately when `active` goes false.
export function useDelayedFlag(active: boolean, delayMs = 200): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return shown;
}
