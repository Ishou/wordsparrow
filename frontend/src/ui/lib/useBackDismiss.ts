import { useEffect, useRef } from 'react';

// Same-URL history entry: Back fires popstate without a route change, so we intercept and dismiss instead.
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
      // UI-close (not Back): pop the sentinel to balance history, unless a forward link already replaced it.
      if (armed && (window.history.state as { __backDismiss?: boolean } | null)?.__backDismiss) {
        window.history.back();
      }
    };
  }, [active]);
}
