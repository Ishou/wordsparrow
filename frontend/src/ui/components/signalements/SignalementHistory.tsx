// Read-only handled-report history (ADR-0115); contribuer-gated upstream.

import { useEffect, useState } from 'react';
import { css } from 'styled-system/css';
import { t } from '@/ui/i18n';
import { relativeTimeFr } from '@/ui/lib/relativeTimeFr';
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

export interface SignalementHistoryProps {
  readonly surveyClient: SurveyClient;
}

export function SignalementHistory({ surveyClient }: SignalementHistoryProps) {
  const [items, setItems] = useState<ReadonlyArray<SignalementHistoryItem> | null>(null);
  const [error, setError] = useState(false);

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
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
