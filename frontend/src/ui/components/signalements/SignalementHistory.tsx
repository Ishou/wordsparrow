// Read-only handled-report history (ADR-0115); contribuer-gated upstream.

import { useCallback, useEffect, useState } from 'react';
import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { css } from 'styled-system/css';
import { t } from '@/ui/i18n';
import { useToast } from '@/ui/components/primitives';
import { relativeTimeFr } from '@/ui/lib/relativeTimeFr';
import { reopenSignalement, SurveyUndoFailed } from '@/application/correction';
import type { CorrectionClient } from '@/application/correction';
import type { ReportReason, ReportSurface, SignalementHistoryItem, SurveyClient } from '@/application/survey';

const reasonLabelKey = {
  mot_offensant: 'signalement.reason.mot_offensant',
  definition_offensante: 'signalement.reason.definition_offensante',
  erreur_sens: 'signalement.reason.erreur_sens',
  erreur_grammaire: 'signalement.reason.erreur_grammaire',
  definition_revele: 'signalement.reason.definition_revele',
  ambigu: 'signalement.reason.ambigu',
  trop_facile: 'signalement.reason.trop_facile',
  trop_difficile: 'signalement.reason.trop_difficile',
  autre: 'signalement.reason.autre',
} as const satisfies Record<ReportReason, string>;

const surfaceLabelKey = {
  solo: 'route.signalements.surface.solo',
  daily: 'route.signalements.surface.daily',
  multiplayer: 'route.signalements.surface.multiplayer',
  mini_game: 'route.signalements.surface.mini_game',
} as const satisfies Record<ReportSurface, string>;

const stackStyles = css({ display: 'flex', flexDirection: 'column', gap: '16px' });
const statusStyles = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'semibold', color: 'ws.khaki', margin: 0 });
const alertStyles = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.sakuraDark', margin: 0 });
const listStyles = css({ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' });
const rowStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '16px',
  borderRadius: '18px',
  bg: 'ws.card',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)',
});
const rowTopStyles = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px' });
const motStyles = css({ fontFamily: 'wsDisplay', fontSize: '18px', fontWeight: 'semibold', color: 'ws.jadeInk' });
const clueStyles = css({ fontFamily: 'wsUi', fontSize: '15px', color: 'ws.jadeInk', margin: 0 });
const metaStyles = css({ fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'semibold', color: 'ws.khaki', margin: 0 });
const timeStyles = css({ fontFamily: 'wsUi', fontSize: '12px', color: 'ws.khaki', margin: 0 });
const chipBase = { fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'black', letterSpacing: '0.04em', textTransform: 'uppercase' } as const;
const actionChip = css({ ...chipBase, color: 'ws.jadeInk' });
const dismissChip = css({ ...chipBase, color: 'ws.khaki' });
const actionsStyles = css({ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' });
const reopenBtn = css({
  minHeight: '40px',
  paddingInline: '14px',
  borderRadius: '11px',
  border: '1px solid token(colors.ws.sable)',
  bg: 'transparent',
  color: 'ws.jadeInk',
  fontFamily: 'wsUi',
  fontSize: '14px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'background-color 120ms',
  _hover: { bg: 'ws.sable' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

const scrim = css({ position: 'fixed', inset: 0, zIndex: 1000, bg: 'rgba(15,33,28,0.45)', animation: 'wsFade 180ms ease-out' });
const positioner = css({ position: 'fixed', inset: 0, zIndex: 1001, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', lg: { alignItems: 'center' } });
const confirmSheet = css({
  width: '100%',
  maxWidth: '420px',
  bg: 'ws.card',
  borderTopLeftRadius: '22px',
  borderTopRightRadius: '22px',
  padding: '18px 18px calc(20px + env(safe-area-inset-bottom))',
  boxShadow: '0 -8px 30px rgba(20,40,34,0.22)',
  fontFamily: 'wsUi',
  animation: 'wsSheetUp 260ms cubic-bezier(0.32,0.72,0,1)',
  outline: 'none',
  lg: { borderRadius: '22px', animation: 'wsFade 150ms ease-out' },
});
const confirmTitle = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '19px', color: 'ws.jadeInk', margin: '0 0 8px' });
const confirmBody = css({ fontSize: '14px', color: 'ws.jadeInk', margin: '0 0 16px', lineHeight: '1.5' });
const confirmActions = css({ display: 'flex', gap: '10px', justifyContent: 'flex-end' });
const confirmBtnBase = { minHeight: '44px', paddingInline: '18px', borderRadius: '13px', fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', border: 'none' } as const;
const confirmCancelBtn = css({ ...confirmBtnBase, bg: 'transparent', color: 'ws.khaki', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const confirmConfirmBtn = css({ ...confirmBtnBase, bg: 'ws.sakuraDark', color: 'white', _hover: { filter: 'brightness(0.96)' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

export interface SignalementHistoryProps {
  readonly surveyClient: SurveyClient;
  // ADR-0116: reversing the correction on reopen composes the grid correction; absent in fixtures that don't exercise it.
  readonly correctionClient?: CorrectionClient;
}

export function SignalementHistory({ surveyClient, correctionClient }: SignalementHistoryProps) {
  const { show: showToast } = useToast();
  const [items, setItems] = useState<ReadonlyArray<SignalementHistoryItem> | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SignalementHistoryItem | null>(null);

  useEffect(() => {
    let alive = true;
    surveyClient
      .listHandledSignalements()
      .then((list) => {
        if (alive) setItems(list);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [surveyClient]);

  const handleReopen = useCallback(
    async (h: SignalementHistoryItem): Promise<void> => {
      if (!correctionClient) return;
      setBusyId(h.reportId);
      try {
        await reopenSignalement(
          { correctionClient, surveyClient },
          { reportId: h.reportId, oldClueText: h.clueText, ...(h.wordText ? { wordText: h.wordText } : {}) },
        );
        setItems((prev) => (prev ? prev.filter((x) => x.reportId !== h.reportId) : prev));
        showToast({ text: t('route.signalements.reopen.toast'), tone: 'info' });
      } catch (err) {
        // The grid correction is already reversed here (ADR-0116 §3); re-clicking Réouvrir is safe, reverseCorrection is a no-op the second time.
        showToast({
          text: t(err instanceof SurveyUndoFailed ? 'route.signalements.reopen.retryError' : 'route.signalements.reopen.error'),
          tone: 'error',
        });
      } finally {
        setBusyId(null);
      }
    },
    [correctionClient, surveyClient, showToast],
  );

  return (
    <div className={stackStyles}>
      {items === null && !error ? <p className={statusStyles} role="status">{t('common.loading')}</p> : null}
      {error ? <p className={alertStyles} role="alert">{t('route.signalements.error')}</p> : null}
      {items !== null && items.length === 0 ? <p className={statusStyles}>{t('route.signalements.history.empty')}</p> : null}

      {items !== null && items.length > 0 ? (
        <ul className={listStyles}>
          {items.map((h) => {
            const actioned = h.decision === 'action';
            const decided = actioned
              ? t('route.signalements.history.decision.action')
              : t('route.signalements.history.decision.dismiss');
            return (
              <li key={h.reportId} className={rowStyles} data-testid="signalement-history-row">
                <div className={rowTopStyles}>
                  {h.wordText ? <span className={motStyles}>{h.wordText}</span> : null}
                  <span className={actioned ? actionChip : dismissChip}>{decided}</span>
                </div>
                <p className={clueStyles}>{h.clueText}</p>
                <p className={metaStyles}>
                  {t(reasonLabelKey[h.reason])} · {t(surfaceLabelKey[h.surface])}
                </p>
                <p className={timeStyles}>{relativeTimeFr(h.triagedAt)}</p>
                {correctionClient ? (
                  <div className={actionsStyles}>
                    <button
                      type="button"
                      className={reopenBtn}
                      onClick={() => setConfirming(h)}
                      disabled={busyId === h.reportId}
                      aria-label={t(
                        actioned ? 'route.signalements.reopen.aria' : 'route.signalements.reopen.aria.dismiss',
                        { mot: h.wordText ?? h.clueText },
                      )}
                    >
                      {t('route.signalements.reopen')}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <Dialog.Root
        open={confirming !== null}
        onOpenChange={(d) => { if (!d.open) setConfirming(null); }}
        modal
        closeOnInteractOutside
        closeOnEscape
        preventScroll
      >
        <Portal>
          <Dialog.Backdrop className={scrim} />
          <Dialog.Positioner className={positioner}>
            <Dialog.Content className={confirmSheet} data-testid="reopen-confirm-sheet">
              <Dialog.Title className={confirmTitle}>{t('route.signalements.reopen.confirm.title')}</Dialog.Title>
              <Dialog.Description className={confirmBody}>
                {confirming?.decision === 'action'
                  ? t('route.signalements.reopen.confirm.body')
                  : t('route.signalements.reopen.confirm.bodyDismiss')}
              </Dialog.Description>
              <div className={confirmActions}>
                <button type="button" className={confirmCancelBtn} onClick={() => setConfirming(null)}>
                  {t('route.signalements.reopen.confirm.cancel')}
                </button>
                <button
                  type="button"
                  className={confirmConfirmBtn}
                  onClick={() => {
                    const h = confirming;
                    setConfirming(null);
                    if (h) void handleReopen(h);
                  }}
                >
                  {t('route.signalements.reopen.confirm.confirm')}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </div>
  );
}
