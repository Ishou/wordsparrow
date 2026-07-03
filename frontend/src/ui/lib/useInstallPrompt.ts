import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

// Chromium fires beforeinstallprompt; iOS Safari never does (manual A2HS via the share sheet, documented in Aide).
export function useInstallPrompt(): {
  readonly canInstall: boolean;
  readonly promptInstall: () => void;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.('(display-mode: standalone)').matches) {
      setStandalone(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setStandalone(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(() => {
    const d = deferred;
    if (d == null) return;
    void d.prompt();
    void d.userChoice.finally(() => setDeferred(null));
  }, [deferred]);

  return { canInstall: deferred != null && !standalone, promptInstall };
}
