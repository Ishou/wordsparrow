import { useState } from 'react';
import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { ArrowCounterClockwise, BookOpenText, SpeakerSimpleHigh, SpeakerSimpleSlash } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { Button } from '@/design-system';

// Forward-declared preference: persists sound choice for a future sound layer; no effect today.
const SOUND_KEY = 'ws-play-sound';
function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

const scrim = css({ position: 'fixed', inset: 0, zIndex: 1000, bg: 'rgba(20,40,34,0.34)', animation: 'wsFade 180ms ease-out' });
const sheetPositioner = css({ position: 'fixed', inset: 0, zIndex: 1001, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' });
const centerPositioner = css({ position: 'fixed', inset: 0, zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' });

const sheet = css({
  width: '100%',
  maxWidth: '440px',
  bg: '#FBF8F0',
  borderTopLeftRadius: '22px',
  borderTopRightRadius: '22px',
  padding: '10px 16px calc(20px + env(safe-area-inset-bottom))',
  boxShadow: '0 -8px 30px rgba(20,40,34,0.22)',
  fontFamily: 'wsUi',
  animation: 'wsSheetUp 260ms cubic-bezier(0.32,0.72,0,1)',
  outline: 'none',
});
const grab = css({ width: '40px', height: '4px', borderRadius: '2px', bg: 'rgba(33,75,64,0.18)', margin: '4px auto 12px' });

const row = css({
  display: 'flex',
  alignItems: 'center',
  gap: '13px',
  width: '100%',
  padding: '13px 6px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  borderBottom: '1px solid rgba(33,75,64,0.08)',
  _last: { borderBottom: 'none' },
  _active: { bg: 'rgba(33,75,64,0.04)' },
});
const rowIcon = css({ width: '34px', height: '34px', borderRadius: '10px', bg: '#EDE7D6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'ws.jadeInk', fontSize: '17px', flex: 'none' });
const rowBody = css({ flex: 1, minWidth: 0 });
const rowLabel = css({ fontWeight: 'semibold', fontSize: '15px', color: 'ws.jadeInk' });
const rowSub = css({ fontSize: '11.5px', color: 'ws.khaki', opacity: 0.65, marginTop: '1px' });

const sw = css({ width: '42px', height: '25px', borderRadius: '999px', flex: 'none', position: 'relative', border: 'none', cursor: 'pointer', transition: 'background 160ms', bg: 'rgba(33,75,64,0.2)', '&[data-on]': { bg: 'ws.sakura' } });
const swKnob = css({ position: 'absolute', top: '2.5px', left: '2.5px', width: '20px', height: '20px', borderRadius: '50%', bg: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 160ms' });

const card = css({ width: '100%', maxWidth: '380px', bg: '#FBF8F0', borderRadius: '20px', padding: '22px', boxShadow: '0 16px 44px rgba(20,40,34,0.3)', fontFamily: 'wsUi', outline: 'none', animation: 'cardRise 200ms ease-out' });
const cardTitle = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '20px', color: 'ws.jadeInk', margin: '0 0 14px' });
const howList = css({ display: 'flex', flexDirection: 'column', gap: '12px', margin: 0, padding: 0, listStyle: 'none' });
const howItem = css({ display: 'flex', gap: '11px', fontSize: '13.5px', lineHeight: '1.45', color: 'ws.khaki' });
const howBullet = css({ width: '7px', height: '7px', borderRadius: '50%', bg: 'ws.sakura', flex: 'none', marginTop: '6px' });
const cardActions = css({ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' });
const confirmText = css({ fontSize: '14px', lineHeight: '1.5', color: 'ws.khaki', margin: '0 0 4px' });
const srTitle = css({ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 });

const HOW_TO = [
  'Les cases sombres portent les définitions ; la flèche donne le sens du mot.',
  'Touchez une case, puis tapez les lettres avec le clavier.',
  'Un mot juste se verrouille et se pose en sable.',
  '« Indice » révèle une lettre de la case active.',
  'Pincez pour zoomer, ou utilisez les boutons − / + sous la grille.',
];

export interface PlayMenuProps {
  readonly open: boolean;
  readonly onClose: () => void;
  // Invoked when the user confirms "Recommencer" — clears entries + restarts.
  readonly onRecommencer: () => void;
}

export function PlayMenu({ open, onClose, onRecommencer }: PlayMenuProps) {
  const [howTo, setHowTo] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sound, setSound] = useState(readSound);

  const toggleSound = () => {
    setSound((s) => {
      const next = !s;
      try {
        localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
      } catch {
        // preference is best-effort; ignore storage failures.
      }
      return next;
    });
  };

  const openHowTo = () => {
    onClose();
    setHowTo(true);
  };
  const openConfirm = () => {
    onClose();
    setConfirm(true);
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(d) => { if (!d.open) onClose(); }} modal closeOnInteractOutside closeOnEscape preventScroll>
        <Portal>
          <Dialog.Backdrop className={scrim} />
          <Dialog.Positioner className={sheetPositioner}>
            <Dialog.Content className={sheet}>
              <Dialog.Title className={srTitle}>Réglages</Dialog.Title>
              <span aria-hidden="true" className={grab} />
              <button type="button" className={row} onClick={openHowTo}>
                <span className={rowIcon}><BookOpenText aria-hidden="true" weight="fill" /></span>
                <span className={rowBody}>
                  <span className={rowLabel}>Comment jouer</span>
                  <span className={rowSub} style={{ display: 'block' }}>Règles, flèches, indices</span>
                </span>
              </button>
              <button type="button" className={row} onClick={toggleSound} role="switch" aria-checked={sound} aria-label="Son">
                <span className={rowIcon}>{sound ? <SpeakerSimpleHigh aria-hidden="true" weight="fill" /> : <SpeakerSimpleSlash aria-hidden="true" weight="fill" />}</span>
                <span className={rowBody}>
                  <span className={rowLabel}>Son</span>
                </span>
                <span className={sw} data-on={sound || undefined}>
                  <span className={swKnob} style={{ transform: sound ? 'translateX(17px)' : 'translateX(0)' }} />
                </span>
              </button>
              <button type="button" className={row} onClick={openConfirm}>
                <span className={rowIcon}><ArrowCounterClockwise aria-hidden="true" weight="bold" /></span>
                <span className={rowBody}>
                  <span className={rowLabel}>Recommencer</span>
                  <span className={rowSub} style={{ display: 'block' }}>Effacer et reprendre la grille</span>
                </span>
              </button>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <Dialog.Root open={howTo} onOpenChange={(d) => { if (!d.open) setHowTo(false); }} modal closeOnInteractOutside closeOnEscape preventScroll>
        <Portal>
          <Dialog.Backdrop className={scrim} />
          <Dialog.Positioner className={centerPositioner}>
            <Dialog.Content className={card}>
              <Dialog.Title className={cardTitle}>Comment jouer</Dialog.Title>
              <ul className={howList}>
                {HOW_TO.map((t) => (
                  <li key={t} className={howItem}>
                    <span aria-hidden="true" className={howBullet} />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              <div className={cardActions}>
                <Button variant="primary" onClick={() => setHowTo(false)}>J&apos;ai compris</Button>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <Dialog.Root open={confirm} onOpenChange={(d) => { if (!d.open) setConfirm(false); }} modal closeOnInteractOutside closeOnEscape preventScroll>
        <Portal>
          <Dialog.Backdrop className={scrim} />
          <Dialog.Positioner className={centerPositioner}>
            <Dialog.Content className={card}>
              <Dialog.Title className={cardTitle}>Recommencer la grille ?</Dialog.Title>
              <p className={confirmText}>Vos lettres saisies seront effacées. Cette action est irréversible.</p>
              <div className={cardActions}>
                <Button variant="secondary" onClick={() => setConfirm(false)}>Annuler</Button>
                <Button variant="primary" onClick={() => { setConfirm(false); onRecommencer(); }}>Recommencer</Button>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
