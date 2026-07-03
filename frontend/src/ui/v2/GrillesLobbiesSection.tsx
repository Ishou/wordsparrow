import { Link } from '@tanstack/react-router';
import { CaretRight } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import type { LobbySummary } from '@/application/game';

// Session-scoped read only (ADR-0066 §4); stays single-shape when the user-scoped endpoint lands.

const list = css({ listStyle: 'none', margin: 0, padding: 0 });

const card = css({
  width: '100%',
  textAlign: 'left',
  textDecoration: 'none',
  bg: 'white',
  borderRadius: '16px',
  padding: '13px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '10px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.08)',
  cursor: 'pointer',
  transition: 'background-color 120ms',
  _hover: { bg: 'ws.sable' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '-3px' },
});

const mid = css({ flex: 1, minWidth: 0 });
const rowTitle = css({ fontFamily: 'wsUi', fontWeight: 'black', fontSize: '14px', color: 'ws.jadeInk' });
const rowMeta = css({ fontFamily: 'wsUi', fontWeight: 'bold', fontSize: '11.5px', color: 'ws.khaki', opacity: 0.85, marginTop: '2px' });
const bar = css({ height: '7px', borderRadius: '999px', bg: 'rgba(33,75,64,0.1)', overflow: 'hidden', marginTop: '7px' });
const barFill = css({ display: 'block', height: '100%', borderRadius: '999px', bg: '#4F6E5C' });
const chevron = css({ flex: 'none', color: 'ws.khaki', opacity: 0.55 });

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
