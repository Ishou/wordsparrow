import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canNativeShare, shareOrCopyInviteUrl } from '@/ui/lib/shareInvite';

const URL = 'https://wordsparrow.io/join/A2B3C4';

describe('shareInvite', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    // @ts-expect-error -- test-only teardown of a jsdom stub.
    delete navigator.share;
  });

  describe('canNativeShare', () => {
    it('is false when navigator.share is absent (jsdom default)', () => {
      expect(canNativeShare()).toBe(false);
    });

    it('is true once navigator.share is stubbed', () => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: vi.fn().mockResolvedValue(undefined),
      });
      expect(canNativeShare()).toBe(true);
    });
  });

  describe('shareOrCopyInviteUrl', () => {
    it('resolves "shared" and never touches the clipboard when navigator.share resolves', async () => {
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

    it('writes straight to the clipboard and resolves "copied" when there is no share sheet', async () => {
      const result = await shareOrCopyInviteUrl(URL);

      expect(result).toBe('copied');
      expect(writeText).toHaveBeenCalledWith(URL);
    });
  });
});
