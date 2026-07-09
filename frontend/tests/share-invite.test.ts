import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canNativeShare, shareOrCopyInviteUrl } from '@/ui/lib/shareInvite';

const URL = 'https://wordsparrow.io/join/A2B3C4';
const QUERY = '(any-pointer: coarse) and (any-hover: none)';

const originalMatchMedia = window.matchMedia;

// Touch-primary devices report `matches: true` for the coarse/no-hover query.
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: QUERY,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as typeof window.matchMedia;
}

describe('shareInvite', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    // Default: touch device (share sheet available and preferred).
    stubMatchMedia(true);
  });

  afterEach(() => {
    // @ts-expect-error -- test-only teardown of a jsdom stub.
    delete navigator.share;
    window.matchMedia = originalMatchMedia;
  });

  describe('canNativeShare', () => {
    it('is false when navigator.share is absent (jsdom default)', () => {
      expect(canNativeShare()).toBe(false);
    });

    it('is true on a touch device once navigator.share is stubbed', () => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: vi.fn().mockResolvedValue(undefined),
      });
      expect(canNativeShare()).toBe(true);
    });

    it('is false on a non-touch device even when navigator.share exists', () => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: vi.fn().mockResolvedValue(undefined),
      });
      stubMatchMedia(false);
      expect(canNativeShare()).toBe(false);
    });
  });

  describe('shareOrCopyInviteUrl', () => {
    it('resolves "shared" and never touches the clipboard when navigator.share resolves (touch)', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', { configurable: true, value: share });

      const result = await shareOrCopyInviteUrl(URL);

      expect(result).toBe('shared');
      expect(share).toHaveBeenCalledWith({ url: URL });
      expect(writeText).not.toHaveBeenCalled();
    });

    it('resolves "dismissed" and never touches the clipboard when the user closes the sheet', async () => {
      const share = vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError'));
      Object.defineProperty(navigator, 'share', { configurable: true, value: share });

      const result = await shareOrCopyInviteUrl(URL);

      expect(result).toBe('dismissed');
      expect(writeText).not.toHaveBeenCalled();
    });

    it('falls back to the clipboard and resolves "copied" when navigator.share rejects with a non-abort error', async () => {
      const share = vi.fn().mockRejectedValue(new Error('share target crashed'));
      Object.defineProperty(navigator, 'share', { configurable: true, value: share });

      const result = await shareOrCopyInviteUrl(URL);

      expect(result).toBe('copied');
      expect(writeText).toHaveBeenCalledWith(URL);
    });

    it('copies directly on a non-touch device even when navigator.share exists (never opens the sheet)', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', { configurable: true, value: share });
      stubMatchMedia(false);

      const result = await shareOrCopyInviteUrl(URL);

      expect(result).toBe('copied');
      expect(share).not.toHaveBeenCalled();
      expect(writeText).toHaveBeenCalledWith(URL);
    });

    it('writes straight to the clipboard and resolves "copied" when there is no share sheet', async () => {
      const result = await shareOrCopyInviteUrl(URL);

      expect(result).toBe('copied');
      expect(writeText).toHaveBeenCalledWith(URL);
    });
  });
});
