import { css } from 'styled-system/css';
import { Link } from '@tanstack/react-router';
import { CaretRight } from '@phosphor-icons/react';
import { bar, barFill, card, chevron, list, mid, rowMeta, rowTitle } from './listRowStyles';
import type { LobbySummary } from '@/application/game';
import type { LobbyId } from '@/domain/game';
import { LeaveGameButton } from '@/ui/components/lobby/LeaveGameButton';
import { ShareInviteButton } from '@/ui/components/lobby/ShareInviteButton';
import { t } from '@/ui/i18n';

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

// Reset a <button> to look exactly like the anchor `card` so an ownerless claim row is visually identical to a navigate row.
const cardButton = css({ appearance: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' });

// When a leave affordance is present the card and the leave button sit side by side; the row's bottom gap moves to the wrapper.
const rowWrap = css({ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' });
const cardGrow = css({ flex: 1, minWidth: 0 });

// Subtle hint that the backend GC removes long-idle games; TTL varies by state (ADR-0055 §c, amended by ADR-0098 §4).
const retentionNote = css({
  fontFamily: 'wsUi',
  fontSize: '11.5px',
  fontWeight: 'semibold',
  color: 'ws.khaki',
  opacity: 0.75,
  lineHeight: '1.4',
  margin: '4px 2px 0',
});

// Headless card list — the caller supplies the heading (the /grilles tab) and decides emptiness.
// ADR-0098 §6: `onClaim` (when supplied) turns an ownerless "Reprendre" row into a real claim instead of a plain navigate;
// `onLeave` (when supplied) adds a per-row quitter/supprimer affordance (2026-07-08 amendment).
export function GrillesLobbiesSection({
  lobbies,
  onClaim,
  onLeave,
}: {
  readonly lobbies: readonly LobbySummary[];
  readonly onClaim?: (lobbyId: LobbyId) => void;
  readonly onLeave?: (lobbyId: LobbyId) => void | Promise<void>;
}) {
  return (
    <>
    <ul className={list}>
        {lobbies.map((lobby) => {
          const total = lobby.progress.totalCells;
          const pct = total > 0 ? Math.round((lobby.progress.solvedCells / total) * 100) : 0;
          const label = `${actionFor(lobby)} — ${titleFor(lobby)}`;
          const inner = (
            <>
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
            </>
          );
          const isClaimable = lobby.ownerless === true && onClaim != null;
          const cardClass = onLeave != null ? `${card} ${cardGrow}` : card;
          const rowInner = isClaimable ? (
            <button type="button" className={`${cardClass} ${cardButton}`} aria-label={label} onClick={() => onClaim(lobby.id)} style={onLeave != null ? { marginBottom: 0 } : undefined}>
              {inner}
            </button>
          ) : (
            <Link to="/lobby/$lobbyId" params={{ lobbyId: lobby.id }} className={cardClass} aria-label={label} style={onLeave != null ? { marginBottom: 0 } : undefined}>
              {inner}
            </Link>
          );
          return (
            <li key={lobby.id}>
              {onLeave != null ? (
                <div className={rowWrap}>
                  {rowInner}
                  <ShareInviteButton code={lobby.code} />
                  <LeaveGameButton playerCount={lobby.playerCount} onConfirm={() => onLeave(lobby.id)} />
                </div>
              ) : (
                rowInner
              )}
            </li>
          );
        })}
    </ul>
    <p className={retentionNote}>{t('lobby.list.retentionNote')}</p>
    </>
  );
}
