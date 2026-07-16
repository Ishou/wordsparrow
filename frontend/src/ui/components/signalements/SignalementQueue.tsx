// Maintainer triage queue (ADR-0103). Render-only gate upstream; the survey server enforces contribuer (ADR-0079).

import { useCallback, useEffect, useState } from 'react';
import { css, cx } from 'styled-system/css';
import { useToast } from '@/ui/components/primitives';
import { relativeTimeFr } from '@/ui/lib/relativeTimeFr';
import { t } from '@/ui/i18n';
import type {
  ReportReason,
  ReportSurface,
  SignalementDecision,
  SignalementSummary,
  SurveyClient,
} from '@/application/survey';
import type { CorrectionClient } from '@/application/correction';
import { CorrectionForm } from './CorrectionForm';
import { BlocklistWordDialog } from './BlocklistWordDialog';

const HARM_REASONS: ReadonlySet<ReportReason> = new Set(['mot_offensant', 'definition_offensante']);

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
} as const;

const surfaceLabelKey = {
  solo: 'route.signalements.surface.solo',
  daily: 'route.signalements.surface.daily',
  multiplayer: 'route.signalements.surface.multiplayer',
  mini_game: 'route.signalements.surface.mini_game',
} as const satisfies Record<ReportSurface, string>;

const stackStyles = css({ display: 'flex', flexDirection: 'column', gap: '16px' });

const introStyles = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'semibold', color: 'ws.khaki', margin: 0 });
const statusStyles = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'semibold', color: 'ws.khaki', margin: 0 });
const alertStyles = css({ fontFamily: 'wsUi', fontSize: '14px', fontWeight: 'bold', color: 'ws.sakuraDark', margin: 0 });

const listStyles = css({ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' });

const rowStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '16px',
  borderRadius: '18px',
  bg: 'ws.card',
  boxShadow: '0 1px 2px rgba(33,75,64,0.05), 0 10px 22px rgba(33,75,64,0.08)',
});

const harmRowStyles = css({ boxShadow: '0 0 0 1.5px token(colors.ws.sakuraDark), 0 10px 22px rgba(33,75,64,0.08)' });

const rowTopStyles = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' });
const motStyles = css({ fontFamily: 'wsDisplay', fontSize: '18px', fontWeight: 'semibold', color: 'ws.jadeInk' });
const clueStyles = css({ fontFamily: 'wsUi', fontSize: '15px', color: 'ws.jadeInk', margin: 0 });
const metaStyles = css({ fontFamily: 'wsUi', fontSize: '12.5px', fontWeight: 'semibold', color: 'ws.khaki', margin: 0 });
const timeStyles = css({ fontFamily: 'wsUi', fontSize: '12px', color: 'ws.khaki', margin: 0 });
const pillBase = {
  display: 'inline-flex',
  alignItems: 'center',
  fontFamily: 'wsUi',
  fontSize: '11px',
  fontWeight: 'black',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  paddingInline: '9px',
  paddingBlock: '3px',
  borderRadius: '999px',
  whiteSpace: 'nowrap',
} as const;
// jadeInk (not sakuraDark) on sakuraBlush clears WCAG AA in both themes (~7.7:1 light, ~12.7:1 dark).
const harmPillStyles = css({ ...pillBase, bg: 'ws.sakuraBlush', color: 'ws.jadeInk' });
const minePillStyles = css({ ...pillBase, bg: 'ws.sable', color: 'ws.jadeInk' });
const countPillStyles = css({ ...pillBase, bg: 'transparent', border: '1.5px solid token(colors.ws.sable)', color: 'ws.khaki' });
const noteStyles = css({ fontFamily: 'wsUi', fontSize: '12.5px', color: 'ws.khaki', margin: 0, fontStyle: 'italic' });

const actionsStyles = css({ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' });

const decisionBtnBase = {
  minHeight: '44px',
  paddingInline: '16px',
  borderRadius: '11px',
  border: 'none',
  fontFamily: 'wsUi',
  fontSize: '15px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'background-color 120ms, color 120ms, opacity 120ms',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
} as const;
const handleBtnStyles = css({ ...decisionBtnBase, bg: 'ws.jadeInk', color: 'ws.onJadeInk', _hover: { opacity: 0.9 } });
const rejectBtnStyles = css({ ...decisionBtnBase, bg: 'ws.sable', color: 'ws.jadeInk', _hover: { bg: 'ws.sableHover' } });

// Harm reasons first; Array.sort is stable so the server's recency order is preserved within each partition.
function harmFirst(items: ReadonlyArray<SignalementSummary>): SignalementSummary[] {
  return [...items].sort((a, b) => Number(HARM_REASONS.has(b.reason)) - Number(HARM_REASONS.has(a.reason)));
}

export interface SignalementQueueProps {
  readonly surveyClient: SurveyClient;
  // ADR-0108: composes the grid correction; absent in fixtures that don't exercise the correction path.
  readonly correctionClient?: CorrectionClient;
}

export function SignalementQueue({ surveyClient, correctionClient }: SignalementQueueProps) {
  const { show: showToast } = useToast();
  const [items, setItems] = useState<ReadonlyArray<SignalementSummary> | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    surveyClient
      .listSignalements()
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

  const drop = useCallback((reportId: string) => {
    setItems((prev) => (prev ? prev.filter((x) => x.reportId !== reportId) : prev));
  }, []);

  async function decide(summary: SignalementSummary, decision: SignalementDecision): Promise<void> {
    setBusyId(summary.reportId);
    try {
      await surveyClient.decideSignalement(summary.reportId, decision);
      drop(summary.reportId);
      const toastKey =
        decision === 'dismiss' ? 'route.signalements.toast.dismissed' : 'route.signalements.toast.handled';
      showToast({ text: t(toastKey), tone: 'info' });
    } catch {
      showToast({ text: t('route.signalements.toast.error'), tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={stackStyles}>
      <p className={introStyles}>{t('route.signalements.intro')}</p>

      {items === null && !error ? (
        <p className={statusStyles} role="status">{t('common.loading')}</p>
      ) : null}
      {error ? (
        <p className={alertStyles} role="alert">{t('route.signalements.error')}</p>
      ) : null}
      {items !== null && items.length === 0 ? (
        <p className={statusStyles}>{t('route.signalements.empty')}</p>
      ) : null}

      {items !== null && items.length > 0 ? (
        <ul className={listStyles}>
          {harmFirst(items).map((s) => {
            const harm = HARM_REASONS.has(s.reason);
            return (
              <li key={s.reportId} className={harm ? cx(rowStyles, harmRowStyles) : rowStyles} data-testid="signalement-row">
                <div className={rowTopStyles}>
                  {s.wordText ? <span className={motStyles}>{s.wordText}</span> : null}
                  {harm ? <span className={harmPillStyles}>{t('route.signalements.harmBadge')}</span> : null}
                  {s.mine ? (
                    <span className={minePillStyles}>
                      {t(s.count === 1 ? 'route.signalements.mineBadge.only' : 'route.signalements.mineBadge')}
                    </span>
                  ) : null}
                  <span className={countPillStyles}>{t('route.signalements.count', { count: s.count })}</span>
                </div>
                <p className={clueStyles}>{s.clueText}</p>
                <p className={metaStyles}>
                  {t(reasonLabelKey[s.reason])}
                  {s.surface ? ` · ${t(surfaceLabelKey[s.surface])}` : ''}
                  {s.puzzleId ? ` · ${t('route.signalements.puzzleContext', { id: s.puzzleId.slice(0, 8) })}` : ''}
                </p>
                <p className={timeStyles}>{relativeTimeFr(s.latestAt)}</p>
                {s.latestNote ? (
                  <p className={noteStyles}>{t('route.signalements.latestNote', { note: s.latestNote })}</p>
                ) : null}
                <div className={actionsStyles}>
                  {correctionClient ? (
                    <>
                      <CorrectionForm
                        correctionClient={correctionClient}
                        surveyClient={surveyClient}
                        reportId={s.reportId}
                        oldClueText={s.clueText}
                        wordText={s.wordText}
                        onCorrected={() => drop(s.reportId)}
                      />
                      <BlocklistWordDialog
                        correctionClient={correctionClient}
                        surveyClient={surveyClient}
                        reportId={s.reportId}
                        word={s.wordText}
                        onBlocklisted={() => drop(s.reportId)}
                      />
                    </>
                  ) : null}
                  <button
                    type="button"
                    className={handleBtnStyles}
                    onClick={() => { void decide(s, 'action'); }}
                    disabled={busyId === s.reportId}
                    aria-label={t('route.signalements.markHandled.aria', { mot: s.wordText ?? s.clueText })}
                  >
                    {t('route.signalements.markHandled')}
                  </button>
                  <button
                    type="button"
                    className={rejectBtnStyles}
                    onClick={() => { void decide(s, 'dismiss'); }}
                    disabled={busyId === s.reportId}
                    aria-label={t('route.signalements.reject.aria', { mot: s.wordText ?? s.clueText })}
                  >
                    {t('route.signalements.reject')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
