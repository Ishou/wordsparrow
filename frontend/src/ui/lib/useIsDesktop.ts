import { useEffect, useState } from 'react';

// "Desktop" = a large screen AND a fine pointer (mouse). A large touch tablet over 1024px stays on the
// touch layout (overlay bars + on-screen keyboard) — it has no physical keyboard, so the desktop chrome
// that drops the on-screen keyboard would leave it unable to type. Initialised synchronously to avoid a
// first-paint re-layout flicker.
const DESKTOP_QUERY = '(min-width: 1024px) and (pointer: fine)';
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(DESKTOP_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isDesktop;
}
