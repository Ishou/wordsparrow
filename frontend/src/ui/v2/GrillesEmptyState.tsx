import { SparrowState } from './SparrowState';

// Sparrow perched above an empty nest — the /grilles "no grids yet" state (mockups/error-states-v2.html #5).
const nestScene = (
  <svg width="150" height="132" viewBox="0 0 150 132" role="img" aria-label="Un moineau au-dessus d'un nid">
    <defs>
      <symbol id="gaNest" viewBox="0 0 64 40">
        <ellipse cx="32" cy="26" rx="26" ry="11" fill="#9A7B53" />
        <ellipse cx="32" cy="22" rx="20" ry="8" fill="#7D6242" />
        <ellipse cx="32" cy="22" rx="13" ry="5" fill="#5E4A31" />
      </symbol>
      <symbol id="gaBlossom" viewBox="0 0 24 24">
        <ellipse cx="12" cy="6" rx="3.1" ry="4.2" fill="#F6C9D7" />
        <ellipse cx="12" cy="6" rx="3.1" ry="4.2" fill="#F6C9D7" transform="rotate(72 12 12)" />
        <ellipse cx="12" cy="6" rx="3.1" ry="4.2" fill="#F6C9D7" transform="rotate(144 12 12)" />
        <ellipse cx="12" cy="6" rx="3.1" ry="4.2" fill="#F6C9D7" transform="rotate(216 12 12)" />
        <ellipse cx="12" cy="6" rx="3.1" ry="4.2" fill="#F6C9D7" transform="rotate(288 12 12)" />
        <circle cx="12" cy="12" r="2.3" fill="#D8C77A" />
      </symbol>
      <symbol id="gaBird" viewBox="0 0 64 64">
        <path d="M9 30 L24 33 L20 44 Z" fill="#214B40" />
        <path d="M22 44 C16 41 16 30 21 24 C26 18 35 17 42 21 C46 23 49 27 49 31 L57 29 L49 34 C49 41 43 47 35 47 C30 47 25 46 22 44 Z" fill="#D45D83" />
        <path d="M28 30 C35 29 41 33 42 40 C35 41 29 38 28 30 Z" fill="#BE4970" />
        <path d="M24 42 C27 45 32 45 36 44 C33 47 27 47 24 42 Z" fill="#F6C9D7" />
        <path d="M49 30 L58 31.5 L49 33.5 Z" fill="#D8C77A" />
        <circle cx="44.5" cy="29.5" r="2.4" fill="#fff" />
        <circle cx="45" cy="29.7" r="1.3" fill="#214B40" />
      </symbol>
    </defs>
    <use href="#gaNest" x="39" y="62" width="72" height="44" />
    <use href="#gaBlossom" x="28" y="44" width="14" height="14" />
    <use href="#gaBlossom" x="108" y="52" width="13" height="13" />
    <use href="#gaBird" x="52" y="30" width="46" height="46" />
  </svg>
);

// Copy depends on which tab is empty: a filtered tab still has an archive, it's just empty in that bucket.
const COPY: Record<'new' | 'progress' | 'done', { readonly title: string; readonly body: string }> = {
  new: { title: 'Tout est joué !', body: 'Aucune grille à commencer pour l’instant — reviens demain pour la prochaine.' },
  progress: { title: 'Aucune grille en cours', body: 'Tu n’as pas de grille commencée à reprendre pour le moment.' },
  done: { title: 'Aucune grille terminée', body: 'Termine une grille et tu la retrouveras ici.' },
};

export function GrillesEmptyState({ onPlay, filter = 'new' }: { readonly onPlay: () => void; readonly filter?: 'new' | 'progress' | 'done' }) {
  const copy = COPY[filter];
  return (
    <SparrowState
      scene={nestScene}
      title={copy.title}
      body={copy.body}
      cta={{ label: 'Jouer la grille du jour', onClick: onPlay }}
      as="p"
    />
  );
}
