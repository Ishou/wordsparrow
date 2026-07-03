// Native share sheet when the platform has one (mobile), clipboard otherwise.
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
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
