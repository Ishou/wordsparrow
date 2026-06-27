import { useNavigate } from '@tanstack/react-router';
import { PhoneShell } from './PhoneShell';
import { SparrowState } from './SparrowState';

// Sparrow flying off past a faded "404" along a dashed flight-path (mockups/error-states-v2.html #4).
const notFoundScene = (
  <svg width="150" height="130" viewBox="0 0 150 130" role="img" aria-label="Un moineau qui s'envole">
    <defs>
      <symbol id="nfBird" viewBox="0 0 64 64">
        <path d="M9 30 L24 33 L20 44 Z" fill="#214B40" />
        <path d="M22 44 C16 41 16 30 21 24 C26 18 35 17 42 21 C46 23 49 27 49 31 L57 29 L49 34 C49 41 43 47 35 47 C30 47 25 46 22 44 Z" fill="#D45D83" />
        <path d="M28 30 C35 29 41 33 42 40 C35 41 29 38 28 30 Z" fill="#BE4970" />
        <path d="M24 42 C27 45 32 45 36 44 C33 47 27 47 24 42 Z" fill="#F6C9D7" />
        <path d="M49 30 L58 31.5 L49 33.5 Z" fill="#D8C77A" />
        <circle cx="44.5" cy="29.5" r="2.4" fill="#fff" />
        <circle cx="45" cy="29.7" r="1.3" fill="#214B40" />
      </symbol>
    </defs>
    <text x="14" y="62" fontFamily='"Fredoka Variable", sans-serif' fontWeight="700" fontSize="40" fill="rgba(33,75,64,0.18)">
      404
    </text>
    <path d="M40 90 q40 -36 80 -64" stroke="#C4E5D3" strokeWidth="3" strokeDasharray="2 7" fill="none" strokeLinecap="round" />
    <use href="#nfBird" x="92" y="14" width="48" height="48" transform="rotate(-18 116 38)" />
  </svg>
);

export function NotFoundScreen() {
  const navigate = useNavigate();
  return (
    <PhoneShell>
      <SparrowState
        scene={notFoundScene}
        title="Cette page s'est envolée"
        body={"On n'a rien trouvé ici. Reviens à l'accueil pour jouer."}
        cta={{ label: 'Accueil', onClick: () => void navigate({ to: '/v2' }) }}
      />
    </PhoneShell>
  );
}
