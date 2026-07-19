import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { css, cx } from 'styled-system/css';
import { t } from '@/ui/i18n';
import { useToast } from '@/ui/components/primitives';
import { applyCorrection, LastClueForbidden, markSignalementHandled, previewCorrection, SurveyDecisionFailed } from '@/application/correction';
import type { CorrectionClient, CorrectionInput, CorrectionPreview, WordClue } from '@/application/correction';
import type { SurveyClient } from '@/application/survey';
import { useBackDismiss } from '@/ui/lib/useBackDismiss';
import { useCorrectionProgress } from './useCorrectionProgress';

type Mode = 'replace' | 'forbid';
type ReplaceStyle = 'write' | 'pick';
type CluesStatus = 'idle' | 'loading' | 'ready' | 'error';

const trigger = css({
  minHeight: '44px',
  paddingInline: '16px',
  borderRadius: '11px',
  border: '1px solid token(colors.ws.sakuraDark)',
  bg: 'transparent',
  color: 'ws.sakuraDark',
  fontFamily: 'wsUi',
  fontSize: '15px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'background-color 120ms, color 120ms',
  _hover: { bg: 'ws.sakuraBlush' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

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
const clueEcho = css({ fontSize: '13px', color: 'ws.khaki', margin: '0 0 14px', lineHeight: '1.4' });
const previewMuted = css({ fontSize: '13px', color: 'ws.khaki', margin: '0 0 4px', lineHeight: '1.5', fontStyle: 'italic' });
const fieldset = css({ border: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: '4px' });
const legend = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'black', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'ws.eyebrow', padding: 0, marginBottom: '4px' });
const modeRow = css({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '44px',
  paddingInline: '10px',
  borderRadius: '12px',
  cursor: 'pointer',
  color: 'ws.jadeInk',
  fontSize: '15px',
  lineHeight: '1.3',
  // No background-color transition: a selection highlight must snap to the chosen row. A cross-fade leaves the just-deselected row painted for 120ms (worse on mobile Safari), reading as a stale/wrong highlight.
  '&:has(input:focus-visible)': { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  '&:has(input:disabled)': { cursor: 'not-allowed', color: 'ws.khaki' },
});
// Selected/hover fills are applied by React state, not `:has(input:checked)` — WebKit doesn't re-evaluate `:has()` when a radio is unchecked, leaving stale highlights on mobile Safari. Hover lives only on unselected rows so it can't repaint a selected one.
const rowSelected = css({ bg: 'ws.sakuraBlush', fontWeight: 'bold' });
const rowHoverable = css({ _hover: { bg: 'ws.sable' } });
const radioInput = css({ flex: 'none', width: '20px', height: '20px', accentColor: 'token(colors.ws.sakuraDark)' });
const hint = css({ fontSize: '12px', color: 'ws.khaki', margin: '0 0 10px 42px', fontStyle: 'italic' });
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
const pickList = css({ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '210px', overflowY: 'auto' });
const pickRow = css({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minHeight: '44px',
  paddingInline: '10px',
  borderRadius: '12px',
  cursor: 'pointer',
  color: 'ws.jadeInk',
  fontSize: '15px',
  lineHeight: '1.3',
  // See modeRow: selection highlight snaps, no cross-fade.
  '&:has(input:focus-visible)': { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});
const pickText = css({ flex: '1 1 auto', minWidth: 0 });
const themeTag = css({ flex: 'none', fontFamily: 'wsUi', fontSize: '11px', fontWeight: 'black', letterSpacing: '0.03em', textTransform: 'uppercase', color: 'ws.khaki', bg: 'ws.sable', borderRadius: '999px', paddingInline: '8px', paddingBlock: '2px' });
const pickNotice = css({ fontSize: '13px', color: 'ws.khaki', margin: '0 0 12px', lineHeight: '1.5' });
const rejected = css({ fontSize: '13px', color: 'ws.sakuraDark', margin: '12px 0', lineHeight: '1.5', fontWeight: 'bold' });
const progressText = css({ fontSize: '13px', color: 'ws.khaki', margin: '12px 0', lineHeight: '1.5' });
const doneText = css({ fontSize: '13px', color: 'ws.jadeInk', margin: '12px 0', lineHeight: '1.5', fontWeight: 'bold' });
const actions = css({ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' });
const btnBase = { minHeight: '44px', paddingInline: '18px', borderRadius: '13px', fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', border: 'none' } as const;
const cancelBtn = css({ ...btnBase, bg: 'transparent', color: 'ws.khaki', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const submitBtn = css({ ...btnBase, bg: 'ws.sakuraDark', color: 'white', _hover: { filter: 'brightness(0.96)' }, _disabled: { opacity: 0.45, cursor: 'not-allowed' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

export interface CorrectionFormProps {
  readonly correctionClient: CorrectionClient;
  readonly surveyClient: SurveyClient;
  readonly reportId: string;
  readonly oldClueText: string;
  readonly wordText?: string | null;
  // Called once the report has been recorded + marked handled, so the queue can drop the row.
  readonly onCorrected?: () => void;
  // Test seam; production uses the default poll cadence.
  readonly pollIntervalMs?: number;
}

export function CorrectionForm({
  correctionClient,
  surveyClient,
  reportId,
  oldClueText,
  wordText,
  onCorrected,
  pollIntervalMs,
}: CorrectionFormProps) {
  const { show } = useToast();
  const solvedWord = wordText?.trim() || undefined;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('replace');
  const [replaceStyle, setReplaceStyle] = useState<ReplaceStyle>('write');
  const [hasText, setHasText] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [lastClue, setLastClue] = useState(false);
  const [decisionFailed, setDecisionFailed] = useState(false);
  const [clues, setClues] = useState<ReadonlyArray<WordClue>>([]);
  const [cluesStatus, setCluesStatus] = useState<CluesStatus>('idle');
  const [pickedClue, setPickedClue] = useState<string | null>(null);
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const newClueRef = useRef<HTMLInputElement>(null);
  const fetchedWordRef = useRef<string | null>(null);
  const { progress } = useCorrectionProgress(correctionClient, correctionId, pollIntervalMs);

  const settled = correctionId !== null && !decisionFailed;
  const picking = mode === 'replace' && replaceStyle === 'pick';

  // Fetch the word's clue set once when the picker is first opened; the reported clue is excluded from the offered list.
  useEffect(() => {
    if (!picking || !solvedWord || fetchedWordRef.current === solvedWord) return;
    fetchedWordRef.current = solvedWord;
    let alive = true;
    setCluesStatus('loading');
    correctionClient
      .listWordClues(solvedWord)
      .then((list) => {
        if (alive) {
          setClues(list);
          setCluesStatus('ready');
        }
      })
      .catch(() => {
        if (alive) setCluesStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [picking, solvedWord, correctionClient]);

  const otherClues = useMemo(() => clues.filter((c) => c.text !== oldClueText), [clues, oldClueText]);

  const reset = () => {
    setMode('replace');
    setReplaceStyle('write');
    setHasText(false);
    setSubmitting(false);
    setCorrectionId(null);
    setLastClue(false);
    setDecisionFailed(false);
    setClues([]);
    setCluesStatus('idle');
    setPickedClue(null);
    fetchedWordRef.current = null;
  };

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      reset();
    } else if (settled) {
      onCorrected?.();
    }
  };

  // Touch devices: the browser "back" gesture closes the sheet instead of navigating away.
  useBackDismiss(open, () => onOpenChange(false));

  // Fetch the correction's grid-impact once the sheet opens (ADR-0108); shown before the maintainer applies.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPreview(null);
    setPreviewFailed(false);
    previewCorrection(correctionClient, oldClueText, solvedWord)
      .then((p) => { if (alive) setPreview(p); })
      .catch(() => { if (alive) setPreviewFailed(true); });
    return () => { alive = false; };
  }, [open, oldClueText, solvedWord, correctionClient]);

  const buildInput = (): CorrectionInput | null => {
    if (mode === 'forbid') {
      if (!solvedWord) return null;
      return { kind: 'forbid_clue', oldClueText, wordText: solvedWord };
    }
    const newClueText = replaceStyle === 'pick' ? (pickedClue ?? '') : (newClueRef.current?.value.trim() ?? '');
    if (!newClueText) return null;
    return { kind: 'replace', oldClueText, newClueText, ...(solvedWord ? { wordText: solvedWord } : {}) };
  };

  const submit = async () => {
    if (submitting) return;
    const correction = buildInput();
    if (!correction) return;
    setSubmitting(true);
    setLastClue(false);
    setDecisionFailed(false);
    try {
      const accepted = await applyCorrection({ correctionClient, surveyClient }, { reportId, correction });
      setCorrectionId(accepted.correctionId);
      show({ text: t('correction.success'), tone: 'info' });
    } catch (err) {
      if (err instanceof LastClueForbidden) {
        setLastClue(true);
      } else if (err instanceof SurveyDecisionFailed) {
        setCorrectionId(err.correctionId);
        setDecisionFailed(true);
      } else {
        show({ text: t('correction.error'), tone: 'error' });
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
      show({ text: t('correction.success'), tone: 'info' });
    } catch {
      show({ text: t('correction.error'), tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    !submitting &&
    (mode === 'forbid'
      ? Boolean(solvedWord)
      : replaceStyle === 'pick'
        ? pickedClue !== null
        : hasText);

  return (
    <>
      <button type="button" className={trigger} data-testid="correction-trigger" onClick={() => onOpenChange(true)}>
        {t('correction.trigger')}
      </button>

      <Dialog.Root open={open} onOpenChange={(d) => onOpenChange(d.open)} modal closeOnInteractOutside closeOnEscape preventScroll>
        <Portal>
          <Dialog.Backdrop className={scrim} />
          <Dialog.Positioner className={positioner}>
            <Dialog.Content className={sheet} data-testid="correction-sheet">
              <span aria-hidden="true" className={grab} />
              <Dialog.Title className={title}>{t('correction.title')}</Dialog.Title>
              <Dialog.Description className={clueEcho}>{oldClueText}</Dialog.Description>

              {settled ? (
                <>
                  {progress?.backfillStatus === 'failed' ? (
                    <p className={rejected} role="status">{t('correction.progress.failed')}</p>
                  ) : progress?.backfillStatus === 'done' ? (
                    <p className={doneText} role="status">{t('correction.progress.done', { patched: progress.gridsPatched })}</p>
                  ) : progress && progress.gridsMatched !== null ? (
                    <p className={progressText}>
                      {t('correction.progress.running', { patched: progress.gridsPatched, matched: progress.gridsMatched })}
                    </p>
                  ) : (
                    <p className={progressText}>{t('correction.progress.pending')}</p>
                  )}
                  <div className={actions}>
                    <button type="button" className={cancelBtn} onClick={() => onOpenChange(false)}>{t('correction.close')}</button>
                  </div>
                </>
              ) : (
                <>
                  <fieldset className={fieldset}>
                    <legend className={legend}>{t('correction.mode.legend')}</legend>
                    <label className={mode === 'replace' ? cx(modeRow, rowSelected) : cx(modeRow, rowHoverable)}>
                      <input type="radio" name="correction-mode" className={radioInput} value="replace" checked={mode === 'replace'} onChange={() => { setMode('replace'); setHasText(false); }} />
                      <span>{t('correction.mode.replace')}</span>
                    </label>
                    <label className={mode === 'forbid' ? cx(modeRow, rowSelected) : cx(modeRow, rowHoverable)}>
                      <input type="radio" name="correction-mode" className={radioInput} value="forbid" checked={mode === 'forbid'} disabled={!solvedWord} onChange={() => { setMode('forbid'); setHasText(false); }} />
                      <span>{t('correction.mode.forbid')}</span>
                    </label>
                    {!solvedWord ? <p className={hint}>{t('correction.forbid.needWord')}</p> : null}
                  </fieldset>

                  {mode === 'replace' ? (
                    <>
                      {solvedWord ? (
                        <fieldset className={fieldset}>
                          <legend className={legend}>{t('correction.replace.styleLegend')}</legend>
                          <label className={replaceStyle === 'write' ? cx(modeRow, rowSelected) : cx(modeRow, rowHoverable)}>
                            <input type="radio" name="correction-replace-style" className={radioInput} value="write" checked={replaceStyle === 'write'} onChange={() => { setReplaceStyle('write'); setHasText(false); }} />
                            <span>{t('correction.replace.write')}</span>
                          </label>
                          <label className={replaceStyle === 'pick' ? cx(modeRow, rowSelected) : cx(modeRow, rowHoverable)}>
                            <input type="radio" name="correction-replace-style" className={radioInput} value="pick" checked={replaceStyle === 'pick'} onChange={() => { setReplaceStyle('pick'); setHasText(false); }} />
                            <span>{t('correction.replace.pick')}</span>
                          </label>
                        </fieldset>
                      ) : null}

                      {picking ? (
                        cluesStatus === 'ready' && otherClues.length > 0 ? (
                          <fieldset className={fieldset}>
                            <legend className={legend}>{t('correction.pick.legend')}</legend>
                            <ul className={pickList}>
                              {otherClues.map((c, i) => (
                                <li key={`${c.text}-${i}`}>
                                  <label className={pickedClue === c.text ? cx(pickRow, rowSelected) : cx(pickRow, rowHoverable)}>
                                    <input type="radio" name="correction-pick" className={radioInput} value={c.text} checked={pickedClue === c.text} onChange={() => setPickedClue(c.text)} />
                                    <span className={pickText}>{c.text}</span>
                                    {c.theme ? <span className={themeTag}>{c.theme}</span> : null}
                                  </label>
                                </li>
                              ))}
                            </ul>
                          </fieldset>
                        ) : cluesStatus === 'error' ? (
                          <p className={pickNotice} role="status">{t('correction.pick.error')}</p>
                        ) : cluesStatus === 'ready' ? (
                          <p className={pickNotice} role="status">{t('correction.pick.empty')}</p>
                        ) : (
                          <p className={pickNotice} role="status">{t('common.loading')}</p>
                        )
                      ) : (
                        <div>
                          <label className={fieldLabel} htmlFor="correction-new-clue">{t('correction.newClue.label')}</label>
                          <input
                            id="correction-new-clue"
                            ref={newClueRef}
                            className={textField}
                            type="text"
                            defaultValue=""
                            maxLength={512}
                            placeholder={t('correction.newClue.placeholder')}
                            onInput={(e) => setHasText(e.currentTarget.value.trim().length > 0)}
                          />
                        </div>
                      )}
                    </>
                  ) : null}

                  <p className={previewMuted} role="status">
                    {previewFailed
                      ? t('correction.preview.error')
                      : preview === null
                        ? t('correction.preview.loading')
                        : preview.affectedDailies + preview.affectedSolo === 0
                          ? t('correction.preview.none')
                          : t('correction.preview.counts', { dailies: preview.affectedDailies, solo: preview.affectedSolo })}
                  </p>

                  {lastClue ? <p className={rejected} role="alert">{t('correction.rejected.lastClue')}</p> : null}
                  {decisionFailed ? <p className={rejected} role="alert">{t('correction.retryNotice')}</p> : null}

                  <div className={actions}>
                    <button type="button" className={cancelBtn} onClick={() => onOpenChange(false)}>{t('correction.cancel')}</button>
                    {decisionFailed ? (
                      <button type="button" className={submitBtn} onClick={() => void retryDecision()} disabled={submitting}>{t('correction.retry')}</button>
                    ) : (
                      <button type="button" className={submitBtn} onClick={() => void submit()} disabled={!canSubmit}>{t('correction.submit')}</button>
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
