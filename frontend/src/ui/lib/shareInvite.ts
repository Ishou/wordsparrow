// Native share sheet when the platform has one (mobile), clipboard otherwise.
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

// Reports which branch actually ran so callers can gate "copied" feedback
// on the real outcome rather than on platform capability — a non-abort
// `navigator.share()` rejection still falls back to the clipboard.
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
