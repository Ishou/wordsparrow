import { useState } from 'react';
import { SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import type { SoundStore } from '@/application/session/SoundStore';

// One-tap mute shortcut sharing the localStorage preference with the Réglages toggle.
export function GridSoundToggle({ soundStore, className }: { readonly soundStore: SoundStore; readonly className?: string }) {
  const [on, setOn] = useState(() => soundStore.load());
  const Icon = on ? SpeakerHigh : SpeakerSlash;
  return (
    <button
      type="button"
      className={className}
      aria-label={on ? 'Couper les sons' : 'Activer les sons'}
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
