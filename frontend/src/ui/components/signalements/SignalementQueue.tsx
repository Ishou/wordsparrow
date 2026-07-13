// Maintainer triage queue (ADR-0103). Render-only gate upstream; the survey server enforces contribuer (ADR-0079).

import { useCallback, useEffect, useState } from 'react';
import { css } from 'styled-system/css';
import { Button, useToast } from '@/ui/components/primitives';
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

const articleStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'lg',
  width: '100%',
  maxWidth: '720px',
});

const headingStyles = css({
  fontFamily: 'heading',
  fontSize: { base: 'xl', md: 'display' },
  fontWeight: 'black',
  letterSpacing: '-0.02em',
  margin: 0,
  color: 'fg',
});

const introStyles = css({ fontSize: 'body', color: 'fgMuted', margin: 0 });
const statusStyles = css({ fontSize: 'body', color: 'fgMuted', margin: 0 });
const alertStyles = css({ fontSize: 'body', color: 'errorText', margin: 0 });

const listStyles = css({ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'md' });

const rowStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'xs',
  padding: 'md',
  borderRadius: '12px',
  border: '1px solid token(colors.border)',
  bg: 'surface',
});

const harmRowStyles = css({ borderColor: 'ws.sakuraDark' });

const rowTopStyles = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 'sm' });
const motStyles = css({ fontFamily: 'heading', fontSize: 'lg', fontWeight: 'bold', color: 'fg' });
const clueStyles = css({ fontSize: 'body', color: 'fg', margin: 0 });
const metaStyles = css({ fontSize: 'sm', color: 'fgMuted', margin: 0 });
const harmBadgeStyles = css({
  fontSize: 'xs',
  fontWeight: 'black',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'ws.sakuraDark',
});
const noteStyles = css({ fontSize: 'sm', color: 'fgMuted', margin: 0, fontStyle: 'italic' });

const actionsStyles = css({ display: 'flex', gap: 'sm', marginTop: 'xs' });

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
    <article className={articleStyles}>
      <h1 className={headingStyles}>{t('route.signalements.heading')}</h1>
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
              <li key={s.reportId} className={`${rowStyles}${harm ? ` ${harmRowStyles}` : ''}`} data-testid="signalement-row">
                <div className={rowTopStyles}>
                  {s.wordText ? <span className={motStyles}>{s.wordText}</span> : null}
                  {harm ? <span className={harmBadgeStyles}>{t('route.signalements.harmBadge')}</span> : null}
                </div>
                <p className={clueStyles}>{s.clueText}</p>
                <p className={metaStyles}>
                  {t(reasonLabelKey[s.reason])} · {t('route.signalements.count', { count: s.count })}
                  {s.surface ? ` · ${t(surfaceLabelKey[s.surface])}` : ''}
                  {s.puzzleId ? ` · ${t('route.signalements.puzzleContext', { id: s.puzzleId.slice(0, 8) })}` : ''}
                </p>
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
                  <Button
                    variant="primary"
                    onClick={() => { void decide(s, 'action'); }}
                    disabled={busyId === s.reportId}
                    aria-label={t('route.signalements.markHandled.aria', { mot: s.wordText ?? s.clueText })}
                  >
                    {t('route.signalements.markHandled')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => { void decide(s, 'dismiss'); }}
                    disabled={busyId === s.reportId}
                    aria-label={t('route.signalements.reject.aria', { mot: s.wordText ?? s.clueText })}
                  >
                    {t('route.signalements.reject')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}
