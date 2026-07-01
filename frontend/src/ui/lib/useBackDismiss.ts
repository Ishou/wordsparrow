import { useEffect, useRef } from 'react';

// Mobile Back dismisses an in-page overlay instead of navigating: while active, a same-URL
// history entry turns the Back gesture into a popstate we intercept (no route change).
export function useBackDismiss(active: boolean, onDismiss: () => void): void {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;

    let armed = true;
    window.history.pushState({ __backDismiss: true }, '', window.location.href);

    const onPopState = () => {
      armed = false; // Back consumed our sentinel — dismiss rather than let navigation proceed.
      onDismissRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      // Closed via the UI (not Back): pop our sentinel to balance history — but only if it's still
      // the current entry. If a link navigated forward, popping would bounce the user off the new route.
      if (armed && (window.history.state as { __backDismiss?: boolean } | null)?.__backDismiss) {
        window.history.back();
      }
    };
  }, [active]);
}
