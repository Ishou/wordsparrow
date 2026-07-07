import { useState } from 'react';
import { SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import { t } from '@/ui/i18n';
import type { SoundStore } from '@/application/session/SoundStore';

// One-tap mute shortcut sharing the localStorage preference with the Réglages toggle.
export function GridSoundToggle({ soundStore, className }: { readonly soundStore: SoundStore; readonly className?: string }) {
  const [on, setOn] = useState(() => soundStore.load());
  const Icon = on ? SpeakerHigh : SpeakerSlash;
  return (
    <button
      type="button"
      className={className}
      aria-label={on ? t('play.sound.aria.mute') : t('play.sound.aria.unmute')}
      onClick={() => {
        const next = !on;
        soundStore.set(next);
        setOn(next);
      }}
    >
      <Icon aria-hidden="true" weight="bold" />
    </button>
  );
}
