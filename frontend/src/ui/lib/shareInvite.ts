// Native share sheet when the platform has one (mobile), clipboard otherwise.
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function shareOrCopyInviteUrl(url: string): Promise<void> {
  if (canNativeShare()) {
    try {
      await navigator.share({ url });
      return;
    } catch (cause) {
      // AbortError = the player closed the sheet; anything else falls back to copy.
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
    }
  }
  await navigator.clipboard?.writeText(url);
}
