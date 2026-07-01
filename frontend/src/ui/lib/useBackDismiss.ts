import { useEffect, useRef } from 'react';

// Same-URL history entry: Back fires popstate without a route change, so we intercept and dismiss instead.
export function useBackDismiss(active: boolean, onDismiss: () => void): void {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;

    let armed = true;
    const sentinelHref = window.location.href;
    window.history.pushState({ __backDismiss: true }, '', sentinelHref);

    const onPopState = () => {
      armed = false; // Back consumed our sentinel — dismiss rather than let navigation proceed.
      onDismissRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      // UI-close: pop the sentinel to balance history, but only if still on it — a forward-navigating menu item changed the URL, and popping would undo that navigation.
      if (armed && window.location.href === sentinelHref) {
        window.history.back();
      }
    };
  }, [active]);
}
