import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useRef } from 'react';

export interface UseLongPressOptions {
  readonly onLongPress: () => void;
  readonly enabled: boolean;
  readonly delayMs?: number;
  readonly moveThresholdPx?: number;
}

export interface LongPressHandlers {
  readonly onPointerDown: (e: ReactPointerEvent) => void;
  readonly onPointerMove: (e: ReactPointerEvent) => void;
  readonly onPointerUp: () => void;
  readonly onPointerCancel: () => void;
  readonly onPointerLeave: () => void;
}

export interface UseLongPressResult {
  readonly handlers: LongPressHandlers;
  readonly consumeSuppression: () => boolean;
}

export function useLongPress({
  onLongPress,
  enabled,
  delayMs = 500,
  moveThresholdPx = 10,
}: UseLongPressOptions): UseLongPressResult {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const suppressRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled) return;
      suppressRef.current = false; // each gesture starts clean
      originRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        suppressRef.current = true;
        onLongPress();
        clear();
      }, delayMs);
    },
    [enabled, delayMs, onLongPress, clear],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const origin = originRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (dx * dx + dy * dy > moveThresholdPx * moveThresholdPx) clear();
    },
    [moveThresholdPx, clear],
  );

  const consumeSuppression = useCallback(() => {
    const suppressed = suppressRef.current;
    suppressRef.current = false;
    return suppressed;
  }, []);

  useEffect(() => clear, [clear]);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
    },
    consumeSuppression,
  };
}
