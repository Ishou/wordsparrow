import type { ReactElement } from 'react';

// Single source for the "flown away" sparrow used by every error/empty state
// (404, bad lobby, bad join). Pass `badge` to print a faded label behind the
// bird (e.g. "404"); omit it for a bare flight. One geometry → no drift.
export function sparrowFlightScene(badge?: string): ReactElement {
  return (
    <svg width="150" height="130" viewBox="0 0 150 130" role="img" aria-label="Un moineau qui s'envole">
      <defs>
        <symbol id="sfBird" viewBox="0 0 64 64">
          <path d="M9 30 L24 33 L20 44 Z" fill="#214B40" />
          <path d="M22 44 C16 41 16 30 21 24 C26 18 35 17 42 21 C46 23 49 27 49 31 L57 29 L49 34 C49 41 43 47 35 47 C30 47 25 46 22 44 Z" fill="#D45D83" />
          <path d="M28 30 C35 29 41 33 42 40 C35 41 29 38 28 30 Z" fill="#BE4970" />
          <path d="M24 42 C27 45 32 45 36 44 C33 47 27 47 24 42 Z" fill="#F6C9D7" />
          <path d="M49 30 L58 31.5 L49 33.5 Z" fill="#D8C77A" />
          <circle cx="44.5" cy="29.5" r="2.4" fill="#fff" />
          <circle cx="45" cy="29.7" r="1.3" fill="#214B40" />
        </symbol>
      </defs>
      {badge != null ? (
        <text x="14" y="62" fontFamily='"Fredoka Variable", sans-serif' fontWeight="700" fontSize="40" fill="rgba(33,75,64,0.18)">
          {badge}
        </text>
      ) : null}
      <path d="M40 90 q40 -36 80 -64" stroke="#C4E5D3" strokeWidth="3" strokeDasharray="2 7" fill="none" strokeLinecap="round" />
      <use href="#sfBird" x="92" y="14" width="48" height="48" transform="rotate(-18 116 38)" />
    </svg>
  );
}

// Celebratory perched sparrow singing over a blossom branch — co-op résultats / win motif.
export function sparrowCelebrationScene(): ReactElement {
  return (
    <svg width="148" height="120" viewBox="0 0 148 120" role="img" aria-label="Un moineau qui chante sur une branche fleurie">
      <path d="M16 96 q44 -10 116 -30" stroke="#9CCBB1" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="44" cy="86" r="5.5" fill="#F6C9D7" />
      <circle cx="72" cy="78" r="6.5" fill="#EFB6CB" />
      <circle cx="100" cy="70" r="5.5" fill="#F6C9D7" />
      <circle cx="124" cy="62" r="4.5" fill="#EFB6CB" />
      <g transform="translate(56 18)">
        <path d="M22 50 C14 46 13 31 19 23 C26 14 38 13 46 18 C51 21 54 26 54 31 L64 28 L54 35 C54 44 46 51 36 51 C31 51 26 52 22 50 Z" fill="#D45D83" />
        <path d="M30 30 C39 29 46 34 47 42 C39 43 31 39 30 30 Z" fill="#BE4970" />
        <path d="M24 47 C28 51 34 51 39 50 C35 54 28 53 24 47 Z" fill="#F6C9D7" />
        <path d="M54 28 L65 29.5 L54 32 Z" fill="#D8C77A" />
        <circle cx="48.5" cy="27.5" r="2.6" fill="#fff" />
        <circle cx="49" cy="27.7" r="1.4" fill="#214B40" />
        <path d="M14 14 q4 -4 8 0" stroke="#D45D83" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M26 9 q4 -4 8 0" stroke="#EFB6CB" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
