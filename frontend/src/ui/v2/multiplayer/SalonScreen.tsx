import { canNativeShare, type ShareInviteResult } from '@/ui/lib/shareInvite';
import { useEffect, useRef, useState } from 'react';
import { ArrowsClockwise, Copy, Eye, EyeSlash, SignOut } from '@phosphor-icons/react';
import { css, cx } from 'styled-system/css';
import type { ConnectionState } from '@/application/game';
import {
  MAX_PSEUDONYM_LENGTH,
  type Lobby,
  type Pseudonym,
  type SessionId,
} from '@/domain/game';
import { PlayerAvatar } from './PlayerAvatar';
import { PhoneShell } from '@/ui/v2/PhoneShell';
import { BackHeader } from '@/ui/v2/BackHeader';

// Six presets mirror the prod WaitingRoom picker: four squares + two landscape options.
const GRID_SIZE_OPTIONS = [
  { value: '5x5', label: '5×5', width: 5, height: 5 },
  { value: '7x7', label: '7×7', width: 7, height: 7 },
  { value: '9x9', label: '9×9', width: 9, height: 9 },
  { value: '11x11', label: '11×11', width: 11, height: 11 },
  { value: '15x12', label: '15×12', width: 15, height: 12 },
  { value: '28x20', label: '28×20', width: 28, height: 20 },
] as const;
const MAX_PLAYERS = 8;

export interface SalonScreenProps {
  readonly lobby: Lobby;
  readonly sessionId: SessionId;
  readonly connectionState: ConnectionState;
  readonly pseudonymError: string | null;
  readonly isStarting: boolean;
  readonly isRotating: boolean;
  readonly onRename: (pseudonym: Pseudonym) => void;
  readonly onSetGridConfig: (width: number, height: number) => void;
  readonly onStart: () => void;
  readonly onRotateCode: () => void;
  // See ShareInviteResult (shareInvite.ts) for the gating rule.
  readonly onCopyShareUrl: () => Promise<ShareInviteResult | null>;
  readonly onLeave: () => void;
  readonly onClearPseudonymError?: () => void;
}

const COPY_FEEDBACK_MS = 2000;

const title = css({
  fontFamily: 'wsDisplay',
  fontWeight: 'semibold',
  fontSize: '28px',
  lineHeight: '1.1',
  color: 'ws.jadeInk',
  margin: '4px 0 2px',
});
const lead = css({
  fontFamily: 'wsUi',
  fontSize: '15px',
  fontWeight: 'semibold',
  color: 'ws.khaki',
  opacity: 0.85,
  marginBottom: '20px',
});

const card = css({
  bg: 'ws.glass',
  borderRadius: '18px',
  padding: '16px',
  marginBottom: '16px',
  boxShadow: '0 1px 2px rgba(33,75,64,0.08)',
});
const cardTitle = css({
  fontFamily: 'wsUi',
  fontSize: '13px',
  fontWeight: 'black',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'ws.khaki',
  opacity: 0.85,
  margin: '0 0 12px',
});

const codeRow = css({ display: 'flex', alignItems: 'center', gap: '12px' });
const codeText = css({
  fontFamily: 'wsDisplay',
  fontSize: '34px',
  fontWeight: 'semibold',
  letterSpacing: '0.14em',
  color: 'ws.jadeInk',
  margin: 0,
});
// Masked codes use a slightly wider tracking so the dots read as a deliberate redaction, not glyphs.
const codeMasked = css({ letterSpacing: '0.2em', color: 'ws.khaki', opacity: 0.7 });
const revealButton = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  width: '38px',
  height: '38px',
  borderRadius: '12px',
  border: 'none',
  cursor: 'pointer',
  bg: 'ws.glassStrong',
  color: 'ws.khaki',
  transition: 'color 120ms ease-out, background-color 120ms ease-out',
  _hover: { color: 'ws.jadeInk', bg: 'ws.card' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

const pillButton = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  fontFamily: 'wsUi',
  fontSize: '14px',
  fontWeight: 'bold',
  borderRadius: '999px',
  border: 'none',
  padding: '9px 14px',
  cursor: 'pointer',
  bg: 'ws.jade',
  color: 'ws.jadeInk',
  transition: 'background-color 120ms ease-out, opacity 120ms ease-out',
  _hover: { bg: 'ws.jadeHover' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  _disabled: { opacity: 0.55, cursor: 'not-allowed' },
});
const copyFeedback = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.jadeInk' });

const list = css({ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: 0, margin: 0 });
const playerRow = css({ display: 'flex', alignItems: 'center', gap: '11px' });
const playerName = css({ fontFamily: 'wsUi', fontSize: '16px', fontWeight: 'bold', color: 'ws.jadeInk', minWidth: 0 });
const badge = css({
  flex: 'none',
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'black',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  borderRadius: '999px',
  padding: '3px 8px',
  bg: 'ws.sakuraBlush',
  color: 'ws.sakuraDark',
});
const connDot = css({
  flex: 'none',
  marginLeft: 'auto',
  width: '9px',
  height: '9px',
  borderRadius: '50%',
});
const connDotOnline = css({ background: 'ws.statusOnline' });
const connDotIdle = css({ background: 'ws.statusIdle' });
const connDotLost = css({ background: 'ws.statusLost' });

const renameButton = css({
  fontFamily: 'wsUi',
  fontSize: '14px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  bg: 'transparent',
  border: '1.4px solid token(colors.ws.jadeInk)',
  borderRadius: '12px',
  padding: '9px 14px',
  cursor: 'pointer',
  marginTop: '12px',
  _hover: { bg: 'ws.jade' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const fieldInput = css({
  width: '100%',
  fontFamily: 'wsUi',
  fontSize: '16px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  bg: 'ws.card',
  border: '1.6px solid token(colors.ws.jade)',
  borderRadius: '12px',
  padding: '10px 12px',
  marginTop: '12px',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const errorText = css({ fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.sakuraDark', marginTop: '6px' });

const sizeGroup = css({ display: 'flex', flexWrap: 'wrap', gap: '8px' });
const sizeOption = css({
  fontFamily: 'wsUi',
  fontSize: '15px',
  fontWeight: 'bold',
  color: 'ws.jadeInk',
  bg: 'ws.card',
  border: '1.6px solid token(colors.ws.jade)',
  borderRadius: '12px',
  padding: '9px 13px',
  cursor: 'pointer',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const sizeOptionActive = css({ bg: 'ws.jadeInk', color: 'white', _dark: { color: '#16241D' }, borderColor: 'ws.jadeInk' });

const startButton = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  width: '100%',
  fontFamily: 'wsUi',
  fontSize: '18px',
  fontWeight: 'black',
  color: 'white',
  bg: 'ws.sakuraDark',
  border: 'none',
  borderRadius: '16px',
  padding: '16px',
  cursor: 'pointer',
  marginTop: '6px',
  boxShadow: '0 8px 18px rgba(190,73,112,0.30)',
  transition: 'background-color 120ms ease-out, opacity 120ms ease-out',
  _hover: { bg: '#A63C61' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  _disabled: { bg: '#E0DAC8', color: '#7A7560', boxShadow: 'none', cursor: 'not-allowed' },
});
const leaveButton = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  width: '100%',
  fontFamily: 'wsUi',
  fontSize: '15px',
  fontWeight: 'bold',
  color: 'ws.khaki',
  bg: 'transparent',
  border: 'none',
  borderRadius: '12px',
  padding: '14px',
  cursor: 'pointer',
  marginTop: '12px',
  _hover: { bg: 'rgba(76,72,36,0.08)' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

function connStateLabel(state: ConnectionState): { cls: string; label: string } {
  switch (state) {
    case 'connected':
      return { cls: connDotOnline, label: 'connecté' };
    case 'reconnecting':
    case 'connecting':
      return { cls: connDotIdle, label: 'connexion' };
    case 'disconnected':
      return { cls: connDotLost, label: 'déconnecté' };
  }
}

export function SalonScreen({
  lobby,
  sessionId,
  connectionState,
  pseudonymError,
  isStarting,
  isRotating,
  onRename,
  onSetGridConfig,
  onStart,
  onRotateCode,
  onCopyShareUrl,
  onLeave,
  onClearPseudonymError,
}: SalonScreenProps) {
  const isOwner = lobby.ownerSessionId === sessionId;
  const me = lobby.players.find((p) => p.sessionId === sessionId);

  const [justCopied, setJustCopied] = useState(false);
  const [codeRevealed, setCodeRevealed] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current); }, []);
  const handleCopy = () => {
    void (async () => {
      const result = await onCopyShareUrl();
      if (result !== 'copied') return;
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      setJustCopied(true);
      copyTimerRef.current = setTimeout(() => { setJustCopied(false); copyTimerRef.current = null; }, COPY_FEEDBACK_MS);
    })();
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(me?.pseudonym ?? '');
  const commitRename = () => {
    const trimmed = draft.trim();
    if (me && trimmed.length > 0 && trimmed !== me.pseudonym && trimmed.length <= MAX_PSEUDONYM_LENGTH) {
      onRename(trimmed as Pseudonym);
    }
    setEditing(false);
  };

  const activeSize = GRID_SIZE_OPTIONS.find(
    (o) => o.width === lobby.gridConfig.width && o.height === lobby.gridConfig.height,
  );

  return (
    <PhoneShell header={<BackHeader to="/" />}>
      <h1 className={title}>Partie</h1>
      <p className={lead}>Invite tes amis, puis lance la grille ensemble.</p>

      {lobby.code != null ? (
        <section className={card} aria-label="Code de partie">
          <h2 className={cardTitle}>Code de partie</h2>
          <div className={codeRow}>
            <p className={codeRevealed ? codeText : cx(codeText, codeMasked)}>
              {codeRevealed ? lobby.code : '•'.repeat(lobby.code.length)}
            </p>
            <button
              type="button"
              className={revealButton}
              onClick={() => setCodeRevealed((v) => !v)}
              aria-pressed={codeRevealed}
              aria-label={codeRevealed ? 'Masquer le code' : 'Afficher le code'}
            >
              {codeRevealed ? (
                <EyeSlash size={20} weight="bold" aria-hidden="true" />
              ) : (
                <Eye size={20} weight="bold" aria-hidden="true" />
              )}
            </button>
          </div>
          <div className={cx(codeRow, css({ marginTop: '14px', flexWrap: 'wrap' }))}>
            <button type="button" className={pillButton} onClick={handleCopy}>
              <Copy size={16} weight="bold" aria-hidden="true" />
              {canNativeShare() ? 'Partager le lien' : 'Copier le lien'}
            </button>
            {isOwner ? (
              <button
                type="button"
                className={pillButton}
                onClick={onRotateCode}
                disabled={isRotating}
                aria-busy={isRotating || undefined}
              >
                <ArrowsClockwise size={16} weight="bold" aria-hidden="true" />
                {isRotating ? 'Nouveau code…' : 'Nouveau code'}
              </button>
            ) : null}
            {justCopied ? (
              <span role="status" aria-live="polite" className={copyFeedback}>Lien copié !</span>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className={card} aria-label="Joueurs">
        <h2 className={cardTitle}>Joueurs ({lobby.players.length}/{MAX_PLAYERS})</h2>
        <ul className={list}>
          {lobby.players.map((p) => {
            const conn = connStateLabel(p.sessionId === sessionId ? connectionState : 'connected');
            return (
              <li key={p.sessionId} className={playerRow}>
                <PlayerAvatar sessionId={p.sessionId} pseudonym={p.pseudonym} size={34} />
                <span className={playerName}>
                  {p.pseudonym}
                  {p.sessionId === sessionId ? ' (toi)' : ''}
                </span>
                {p.sessionId === lobby.ownerSessionId ? <span className={badge}>Hôte</span> : null}
                <span
                  className={cx(connDot, conn.cls)}
                  role="img"
                  aria-label={`${p.pseudonym} : ${conn.label}`}
                />
              </li>
            );
          })}
        </ul>

        {me ? (
          editing ? (
            <>
              <input
                className={fieldInput}
                aria-label="Ton pseudonyme"
                value={draft}
                maxLength={MAX_PSEUDONYM_LENGTH}
                autoFocus
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (pseudonymError != null) onClearPseudonymError?.();
                }}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') { setEditing(false); }
                }}
              />
              {pseudonymError != null ? <p className={errorText} role="alert">{pseudonymError}</p> : null}
            </>
          ) : (
            <button
              type="button"
              className={renameButton}
              onClick={() => { setDraft(me.pseudonym); onClearPseudonymError?.(); setEditing(true); }}
            >
              Changer mon pseudo
            </button>
          )
        ) : null}
      </section>

      {isOwner ? (
        <section className={card} aria-label="Taille de la grille">
          <h2 className={cardTitle}>Taille de la grille</h2>
          <div className={sizeGroup} role="group" aria-label="Taille de la grille">
            {GRID_SIZE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={cx(sizeOption, activeSize?.value === o.value ? sizeOptionActive : undefined)}
                aria-pressed={activeSize?.value === o.value}
                onClick={() => onSetGridConfig(o.width, o.height)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <button
          type="button"
          className={startButton}
          onClick={onStart}
          disabled={isStarting}
          aria-busy={isStarting || undefined}
        >
          {isStarting ? 'Démarrage…' : 'Jouer'}
        </button>
      ) : null}

      <button type="button" className={leaveButton} onClick={onLeave}>
        <SignOut size={17} weight="bold" aria-hidden="true" />
        Quitter
      </button>
    </PhoneShell>
  );
}
