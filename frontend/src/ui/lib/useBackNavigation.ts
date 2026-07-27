import type { MouseEvent } from 'react';
import { useCanGoBack, useRouter } from '@tanstack/react-router';

// Cold entries (deep link, PWA launch, the load ending an OAuth round-trip) sit at history index 0, where the Link's own absolute destination is the only safe Retour.
export function useBackNavigation(): (event: MouseEvent<HTMLAnchorElement>) => void {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return (event) => {
    if (!canGoBack || event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    router.history.back();
  };
}
