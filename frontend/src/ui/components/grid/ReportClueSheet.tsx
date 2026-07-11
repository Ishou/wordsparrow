import { useRef, useState } from 'react';
import { Dialog } from '@ark-ui/react/dialog';
import { Portal } from '@ark-ui/react/portal';
import { Link } from '@tanstack/react-router';
import { Flag } from '@phosphor-icons/react';
import { css } from 'styled-system/css';
import { t } from '@/ui/i18n';
import { useToast } from '@/ui/components/primitives';
import { useReportClue } from '@/application/signalement/useReportClue';
import type { ReportReason, ReportSurface, SurveyClient } from '@/application/survey';

const REASONS: readonly ReportReason[] = [
  'mot_offensant',
  'definition_offensante',
  'erreur_sens',
  'erreur_grammaire',
  'definition_revele',
  'ambigu',
  'trop_facile',
  'trop_difficile',
  'autre',
];

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

const trigger = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  minWidth: '44px',
  minHeight: '44px',
  paddingInline: '10px',
  borderRadius: '11px',
  bg: 'transparent',
  color: 'ws.khaki',
  fontFamily: 'wsUi',
  fontSize: '13px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'background-color 120ms, color 120ms',
  _hover: { bg: 'ws.sable', color: 'ws.jadeInk' },
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
});

const scrim = css({
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  bg: 'rgba(15,33,28,0.45)',
  animation: 'wsFade 180ms ease-out',
});
const positioner = css({
  position: 'fixed',
  inset: 0,
  zIndex: 1001,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  lg: { alignItems: 'center' },
});
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
const fieldset = css({ border: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: '4px' });
const legend = css({ fontFamily: 'wsUi', fontSize: '12px', fontWeight: 'black', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'ws.eyebrow', padding: 0, marginBottom: '4px' });
const reasonRow = css({
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
  transition: 'background-color 120ms',
  _hover: { bg: 'ws.sable' },
  '&:has(input:focus-visible)': { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' },
  '&:has(input:checked)': { bg: 'ws.sakuraBlush', fontWeight: 'bold' },
});
const radioInput = css({ flex: 'none', width: '20px', height: '20px', accentColor: 'token(colors.ws.sakuraDark)' });
const noteLabel = css({ display: 'block', fontFamily: 'wsUi', fontSize: '13px', fontWeight: 'bold', color: 'ws.jadeInk', marginBottom: '6px' });
const noteField = css({
  width: '100%',
  minHeight: '64px',
  resize: 'vertical',
  padding: '10px 12px',
  borderRadius: '12px',
  border: '1px solid token(colors.ws.hairline)',
  bg: 'ws.sable',
  color: 'ws.jadeInk',
  fontFamily: 'wsUi',
  fontSize: '14px',
  _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '1px' },
});
const notice = css({ fontSize: '12px', color: 'ws.khaki', margin: '14px 0', lineHeight: '1.5' });
const noticeLink = css({ color: 'ws.sakuraDark', fontWeight: 'bold', textDecoration: 'underline' });
const needWord = css({ fontSize: '12px', color: 'ws.sakuraDark', fontWeight: 'bold', margin: '0 0 12px' });
const actions = css({ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' });
const btnBase = { minHeight: '44px', paddingInline: '18px', borderRadius: '13px', fontFamily: 'wsUi', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', border: 'none' } as const;
const cancelBtn = css({ ...btnBase, bg: 'transparent', color: 'ws.khaki', _hover: { bg: 'ws.sable' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });
const submitBtn = css({ ...btnBase, bg: 'ws.sakuraDark', color: 'white', _hover: { filter: 'brightness(0.96)' }, _disabled: { opacity: 0.45, cursor: 'not-allowed' }, _focusVisible: { outline: '3px solid token(colors.ws.sakuraRose)', outlineOffset: '2px' } });

export interface ReportClueSheetProps {
  readonly surveyClient?: SurveyClient | null;
  readonly surface: ReportSurface;
  readonly clueText: string;
  // Derived by the parent from the active clue's cell entries — the client never holds the solution word (ADR-0076).
  readonly wordText: string;
  readonly puzzleId?: string;
}

export function ReportClueSheet({ surveyClient, surface, clueText, wordText, puzzleId }: ReportClueSheetProps) {
  const { report } = useReportClue(surveyClient ?? null);
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const wordMissing = wordText.trim().length === 0;

  const close = () => setOpen(false);
  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setReason(null);
  };

  const submit = async () => {
    if (!reason || wordMissing || submitting) return;
    setSubmitting(true);
    try {
      await report({
        wordText,
        clueText,
        reason,
        surface,
        note: noteRef.current?.value.trim() || undefined,
        puzzleId,
      });
      show({ text: t('signalement.success'), tone: 'info' });
      close();
    } catch {
      show({ text: t('signalement.error'), tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={trigger}
        data-testid="report-clue"
        aria-label={t('signalement.trigger.aria')}
        onClick={() => onOpenChange(true)}
      >
        <Flag aria-hidden="true" weight="bold" size={16} />
        {t('signalement.trigger')}
      </button>

      <Dialog.Root open={open} onOpenChange={(d) => onOpenChange(d.open)} modal closeOnInteractOutside closeOnEscape preventScroll>
        <Portal>
          <Dialog.Backdrop className={scrim} data-testid="report-clue-backdrop" />
          <Dialog.Positioner className={positioner}>
            <Dialog.Content className={sheet} data-testid="report-clue-sheet">
              <span aria-hidden="true" className={grab} />
              <Dialog.Title className={title}>{t('signalement.title')}</Dialog.Title>
              <Dialog.Description className={clueEcho}>{clueText}</Dialog.Description>

              <fieldset className={fieldset}>
                <legend className={legend}>{t('signalement.reason.legend')}</legend>
                {REASONS.map((r) => (
                  <label key={r} className={reasonRow}>
                    <input
                      type="radio"
                      name="signalement-reason"
                      className={radioInput}
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                    />
                    <span>{t(reasonLabelKey[r])}</span>
                  </label>
                ))}
              </fieldset>

              <label className={noteLabel} htmlFor="signalement-note">{t('signalement.note.label')}</label>
              <textarea
                id="signalement-note"
                ref={noteRef}
                className={noteField}
                defaultValue=""
                maxLength={500}
                placeholder={t('signalement.note.placeholder')}
              />

              <p className={notice}>
                {t('signalement.notice.pre')}
                <Link to="/confidentialite" className={noticeLink}>{t('signalement.notice.link')}</Link>
              </p>

              {wordMissing ? <p className={needWord}>{t('signalement.needWord')}</p> : null}

              <div className={actions}>
                <button type="button" className={cancelBtn} onClick={close}>{t('signalement.cancel')}</button>
                <button
                  type="button"
                  className={submitBtn}
                  onClick={() => { void submit(); }}
                  disabled={!reason || wordMissing || submitting}
                >
                  {t('signalement.submit')}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
