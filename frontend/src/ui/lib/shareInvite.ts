// Same signal as useTouchPrimary — a touch-first device with no hover.
const TOUCH_PRIMARY_QUERY = '(any-pointer: coarse) and (any-hover: none)';

// Native share sheet only on touch-primary platforms; desktops that expose
// navigator.share still fall through to a direct clipboard copy.
export function canNativeShare(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.(TOUCH_PRIMARY_QUERY)?.matches === true;
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
