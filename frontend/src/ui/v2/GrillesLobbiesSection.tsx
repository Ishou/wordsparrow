import { Link } from '@tanstack/react-router';
import { CaretRight } from '@phosphor-icons/react';
import { bar, barFill, card, chevron, list, mid, rowMeta, rowTitle } from './listRowStyles';
import type { LobbySummary } from '@/application/game';

// Session-scoped read only (ADR-0066 §4); stays single-shape when the user-scoped endpoint lands.


// "28 juin" from an ISO timestamp; year omitted, the list only carries recent games.
function dayFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d);
}

function titleFor(lobby: LobbySummary): string {
  if (lobby.title != null && lobby.title.length > 0) return lobby.title;
  const when = dayFr(lobby.lastActivityAt);
  return when.length > 0 ? `Partie du ${when}` : 'Partie à plusieurs';
}

function metaFor(lobby: LobbySummary): string {
  const players = `${lobby.playerCount} joueur${lobby.playerCount > 1 ? 's' : ''}`;
  if (lobby.state === 'COMPLETED') return `${players} · Terminée`;
  if (lobby.state === 'IN_PROGRESS') {
    return `${players} · En cours · ${lobby.progress.solvedCells} / ${lobby.progress.totalCells} cases`;
  }
  return `${players} · En attente`;
}

function actionFor(lobby: LobbySummary): string {
  if (lobby.state === 'COMPLETED') return 'Revoir';
  if (lobby.state === 'IN_PROGRESS') return 'Reprendre';
  return 'Rejoindre';
}

// Headless card list — the caller supplies the heading (the /grilles tab) and decides emptiness.
export function GrillesLobbiesSection({ lobbies }: { readonly lobbies: readonly LobbySummary[] }) {
  return (
    <ul className={list}>
        {lobbies.map((lobby) => {
          const total = lobby.progress.totalCells;
          const pct = total > 0 ? Math.round((lobby.progress.solvedCells / total) * 100) : 0;
          return (
            <li key={lobby.id}>
              <Link
                to="/lobby/$lobbyId"
                params={{ lobbyId: lobby.id }}
                className={card}
                aria-label={`${actionFor(lobby)} — ${titleFor(lobby)}`}
              >
                <div className={mid}>
                  <div className={rowTitle}>{titleFor(lobby)}</div>
                  <div className={rowMeta}>{metaFor(lobby)}</div>
                  {lobby.state === 'IN_PROGRESS' ? (
                    <div className={bar} data-testid="lobby-progress" aria-hidden="true">
                      <span className={barFill} style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                </div>
                <CaretRight className={chevron} size={18} weight="bold" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
    </ul>
  );
}
