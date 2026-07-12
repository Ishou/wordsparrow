import { useState } from 'react';
import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { css } from 'styled-system/css';
import { t } from '@/ui/i18n';
import { useToast } from '@/ui/components/primitives';
import { applyBlocklist, markSignalementHandled, previewBlocklist, SurveyDecisionFailed } from '@/application/correction';
import type { BlocklistPreview, CorrectionClient } from '@/application/correction';
import type { SurveyClient } from '@/application/survey';
import { useCorrectionProgress } from './useCorrectionProgress';

// Fold to the server's match form (uppercase, accents stripped) so the typed confirm accepts any casing/diacritic spelling.
const fold = (s: string): string =>
  s.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const trigger = css({
  minHeight: '44px',
  paddingInline: '16px',
  borderRadius: '11px',
  border: '1px solid token(colors.terra.700)',
  bg: 'transparent',
  color: 'errorText',
  fontFamily: 'wsUi',
  fontSize: '15px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'background-color 120ms, color 120ms',
  _hover: { bg: 'errorBg' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed', _hover: { bg: 'transparent' } },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const triggerHint = css({ fontSize: '12px', color: 'ws.khaki', fontStyle: 'italic', alignSelf: 'center' });

const scrim = css({ position: 'fixed', inset: 0, zIndex: 1000, bg: 'rgba(15,33,28,0.45)', animation: 'wsFade 180ms ease-out' });
const positioner = css({ position: 'fixed', inset: 0, zIndex: 1001, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', lg: { alignItems: 'center' } });
const sheet = css({
  width: '100%',
  maxWidth: '460px',
  maxHeight: '90dvh',
  overflowY: 'auto',
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
const grab = css({ display: 'block', width: '42px', height: '5px', borderRadius: '999px', bg: 'ws.hairline', margin: '0 auto 14px', lg: { display: 'none' } });
const title = css({ fontFamily: 'wsDisplay', fontWeight: 'semibold', fontSize: '19px', color: 'ws.jadeInk', margin: '0 0 4px' });
const wordEcho = css({ fontSize: '13px', color: 'ws.khaki', margin: '0 0 14px', lineHeight: '1.4', fontWeight: 'bold' });
const warning = css({ fontSize: '13px', color: 'errorText', margin: '0 0 12px', lineHeight: '1.5' });
const countsText = css({ fontSize: '14px', color: 'ws.jadeInk', margin: '0 0 14px', lineHeight: '1.5' });
const previewMuted = css({ fontSize: '13px', color: 'ws.khaki', margin: '0 0 14px', lineHeight: '1.5' });
const fieldLabel = css({ display: 'block', fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.jadeInk', marginBottom: '6px' });
const textField = css({
  width: '100%',
  minHeight: '44px',
  padding: '10px 12px',
  borderRadius: '12px',
  border: '1px solid token(colors.ws.hairline)',
  bg: 'ws.sable',
  color: 'ws.jadeInk',
  fontFamily: 'wsUi',
  fontSize: '15px',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '1px' },
});
const rejected = css({ fontSize: '13px', color: 'errorText', margin: '12px 0', lineHeight: '1.5', fontWeight: 'bold' });
const progressText = css({ fontSize: '13px', color: 'ws.khaki', margin: '12px 0', lineHeight: '1.5' });
const doneText = css({ fontSize: '13px', color: 'ws.jadeInk', margin: '12px 0', lineHeight: '1.5', fontWeight: 'bold' });
const actions = css({ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' });
const btnBase = { minHeight: '44px', paddingInline: '18px', borderRadius: '13px', fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', border: 'none' } as const;
const cancelBtn = css({ ...btnBase, bg: 'transparent', color: 'ws.khaki', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const dangerBtn = css({ ...btnBase, bg: 'terra.700', color: 'white', _hover: { filter: 'brightness(0.96)' }, _disabled: { opacity: 0.45, cursor: 'not-allowed' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

export interface BlocklistWordDialogProps {
  readonly correctionClient: CorrectionClient;
  readonly surveyClient: SurveyClient;
  readonly reportId: string;
  readonly word?: string | null;
  // Called once the word has been blocklisted and the report marked handled, so the queue can drop the row.
  readonly onBlocklisted?: () => void;
  // Test seam; production uses the default poll cadence.
  readonly pollIntervalMs?: number;
}

export function BlocklistWordDialog({
  correctionClient,
  surveyClient,
  reportId,
  word,
  onBlocklisted,
  pollIntervalMs,
}: BlocklistWordDialogProps) {
  const { show } = useToast();
  const target = word?.trim() || undefined;
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<BlocklistPreview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [decisionFailed, setDecisionFailed] = useState(false);
  const { progress } = useCorrectionProgress(correctionClient, correctionId, pollIntervalMs);

  const settled = correctionId !== null && !decisionFailed;
  const inputId = `blocklist-confirm-${reportId}`;
  const hintId = `blocklist-hint-${reportId}`;

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      if (!target) return;
      setPreview(null);
      setPreviewError(false);
      setTyped('');
      setSubmitting(false);
      setCorrectionId(null);
      setDecisionFailed(false);
      previewBlocklist(correctionClient, target)
        .then(setPreview)
        .catch(() => setPreviewError(true));
    } else if (settled) {
      onBlocklisted?.();
    }
  };

  const submit = async () => {
    if (submitting || !target) return;
    setSubmitting(true);
    setDecisionFailed(false);
    try {
      const accepted = await applyBlocklist(
        { correctionClient, surveyClient },
        { reportId, blocklist: { kind: 'blocklist_word', wordText: target } },
      );
      setCorrectionId(accepted.correctionId);
      show({ text: t('blocklist.success'), tone: 'info' });
    } catch (err) {
      if (err instanceof SurveyDecisionFailed) {
        setCorrectionId(err.correctionId);
        setDecisionFailed(true);
      } else {
        show({ text: t('blocklist.error'), tone: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const retryDecision = async () => {
    setSubmitting(true);
    try {
      await markSignalementHandled(surveyClient, reportId);
      setDecisionFailed(false);
      show({ text: t('blocklist.success'), tone: 'info' });
    } catch {
      show({ text: t('blocklist.error'), tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmed = target !== undefined && fold(typed) === fold(target);
  const canSubmit = !submitting && preview !== null && confirmed;

  return (
    <>
      <button
        type="button"
        className={trigger}
        data-testid="blocklist-trigger"
        disabled={!target}
        aria-describedby={!target ? hintId : undefined}
        onClick={() => onOpenChange(true)}
      >
        {t('blocklist.trigger')}
      </button>
      {!target ? <span id={hintId} className={triggerHint}>{t('blocklist.trigger.needWord')}</span> : null}

      <Dialog.Root open={open} onOpenChange={(d) => onOpenChange(d.open)} modal closeOnInteractOutside closeOnEscape preventScroll>
        <Portal>
          <Dialog.Backdrop className={scrim} />
          <Dialog.Positioner className={positioner}>
            <Dialog.Content className={sheet} data-testid="blocklist-sheet">
              <span aria-hidden="true" className={grab} />
              <Dialog.Title className={title}>{t('blocklist.title')}</Dialog.Title>
              <Dialog.Description className={wordEcho}>{target}</Dialog.Description>

              {settled ? (
                <>
                  {progress?.backfillStatus === 'failed' ? (
                    <p className={rejected} role="status">{t('blocklist.progress.failed')}</p>
                  ) : progress?.backfillStatus === 'done' ? (
                    <p className={doneText} role="status">{t('blocklist.progress.done', { patched: progress.gridsPatched })}</p>
                  ) : progress && progress.gridsMatched !== null ? (
                    <p className={progressText}>
                      {t('blocklist.progress.running', { patched: progress.gridsPatched, matched: progress.gridsMatched })}
                    </p>
                  ) : (
                    <p className={progressText}>{t('blocklist.progress.pending')}</p>
                  )}
                  <div className={actions}>
                    <button type="button" className={cancelBtn} onClick={() => onOpenChange(false)}>{t('blocklist.close')}</button>
                  </div>
                </>
              ) : (
                <>
                  <p className={warning}>{t('blocklist.warning')}</p>

                  {previewError ? (
                    <p className={rejected} role="alert">{t('blocklist.preview.error')}</p>
                  ) : preview === null ? (
                    <p className={previewMuted} role="status">{t('blocklist.preview.loading')}</p>
                  ) : (
                    <p className={countsText}>
                      {t('blocklist.preview.counts', { dailies: preview.affectedDailies, solo: preview.affectedSolo })}
                    </p>
                  )}

                  <div>
                    <label className={fieldLabel} htmlFor={inputId}>{t('blocklist.confirm.label', { word: target ?? '' })}</label>
                    <input
                      id={inputId}
                      className={textField}
                      type="text"
                      value={typed}
                      placeholder={t('blocklist.confirm.placeholder')}
                      autoComplete="off"
                      onChange={(e) => setTyped(e.currentTarget.value)}
                    />
                  </div>

                  {decisionFailed ? <p className={rejected} role="alert">{t('blocklist.retryNotice')}</p> : null}

                  <div className={actions}>
                    <button type="button" className={cancelBtn} onClick={() => onOpenChange(false)}>{t('blocklist.cancel')}</button>
                    {decisionFailed ? (
                      <button type="button" className={dangerBtn} onClick={() => void retryDecision()} disabled={submitting}>{t('blocklist.retry')}</button>
                    ) : (
                      <button type="button" className={dangerBtn} onClick={() => void submit()} disabled={!canSubmit}>{t('blocklist.submit')}</button>
                    )}
                  </div>
                </>
              )}
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
