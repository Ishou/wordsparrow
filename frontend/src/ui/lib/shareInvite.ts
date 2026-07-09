import { useTouchPrimary } from '@/ui/components/keyboard/useTouchPrimary';

// Same signal as useTouchPrimary — a touch-first device with no hover.
const TOUCH_PRIMARY_QUERY = '(any-pointer: coarse) and (any-hover: none)';

function hasNativeShareApi(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

// Share sheet only on touch-primary devices with navigator.share; desktop always copies.
export function canNativeShare(): boolean {
  if (!hasNativeShareApi()) return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.(TOUCH_PRIMARY_QUERY)?.matches === true;
}

// Reactive twin of canNativeShare(), for icon/label decisions — same gate, re-renders on media query change.
export function useCanNativeShare(): boolean {
  const touchPrimary = useTouchPrimary();
  return touchPrimary && hasNativeShareApi();
}

// Branch actually taken; callers gate "copied" feedback on 'copied', not on platform capability.
export type ShareInviteResult = 'shared' | 'dismissed' | 'copied';

export async function shareOrCopyInviteUrl(url: string): Promise<ShareInviteResult> {
  if (canNativeShare()) {
    try {
      await navigator.share({ url });
      return 'shared';
    } catch (cause) {
      // AbortError = the player closed the sheet; anything else falls back to copy.
      if (cause instanceof DOMException && cause.name === 'AbortError') return 'dismissed';
    }
  }
  await navigator.clipboard?.writeText(url);
  return 'copied';
}
