// ADR-0050 §6 a11y: 56 px touch-target minimum. ADR-0061: metadata is auth-only.

import { useEffect, useRef, useState } from 'react';
import { css, cx } from 'styled-system/css';
import type { LikertScore, SurveyCategorie, SurveyClient, SurveyItem, SurveyPos } from '@/application/survey';
import { POS_OPTIONS, posLabel } from './labels';
import { MetadataBand } from './MetadataBand';
import { StyleTooltip } from './StyleTooltip';
import { useLemmaMeta } from './useLemmaMeta';
import { useMetadataBand } from './useMetadataBand';

const EMPTY_LIST: ReadonlyArray<string> = Object.freeze([]);

export type Verdict = 'GOOD' | 'BAD' | 'SKIP';

export interface RatingMeta {
  readonly targetCategories: ReadonlyArray<SurveyCategorie>;
  readonly targetSense: string;
  readonly isMultisense: boolean;
  readonly subTags: ReadonlyArray<string>;
}

const cardStyles = css({
  bg: 'surface',
  border: '1px solid token(colors.border)',
  borderRadius: 'lg',
  padding: 'lg',
  display: 'flex',
  flexDirection: 'column',
  gap: 'md',
  boxShadow: '0 1px 2px rgba(31, 46, 37, 0.04)',
});

const topRowStyles = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'sm',
  fontSize: 'sm',
  color: 'fgMuted',
});

const posSelectStyles = css({
  appearance: 'none',
  fontFamily: 'body',
  fontSize: 'xs',
  fontWeight: 'semibold',
  color: 'fg',
  bg: 'surface',
  border: '1px solid token(colors.border)',
  borderRadius: '999px',
  paddingInline: 'sm',
  paddingBlock: '4px',
  paddingInlineEnd: '22px',
  cursor: 'pointer',
  backgroundImage:
    'linear-gradient(45deg, transparent 50%, token(colors.fgMuted) 50%), linear-gradient(135deg, token(colors.fgMuted) 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 12px) 53%, calc(100% - 7px) 53%',
  backgroundSize: '5px 5px, 5px 5px',
  backgroundRepeat: 'no-repeat',
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
});

const announcedWrapStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
});

const announcedDotsStyles = css({ display: 'inline-flex', gap: '4px', alignItems: 'center' });

const announcedDotStyles = css({
  width: '9px',
  height: '9px',
  borderRadius: '999px',
  border: '1px solid token(colors.secondary.300)',
  bg: 'transparent',
});

const announcedDotFilledStyles = css({ bg: 'secondary.500', borderColor: 'secondary.500' });

const titleStyles = css({
  fontFamily: 'heading',
  fontSize: { base: '2xl', md: 'display' },
  fontWeight: 'bold',
  letterSpacing: '-0.02em',
  margin: 0,
  color: 'fg',
});

const definitionStyles = css({
  fontFamily: 'heading',
  fontSize: { base: 'lg', md: 'xl' },
  fontStyle: 'italic',
  color: 'fg',
  margin: 0,
  paddingBlock: 'xs',
  paddingInline: 'md',
  borderLeft: '3px solid token(colors.accent)',
});

const corrigerTriggerStyles = css({
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: 'body',
  fontSize: 'sm',
  color: 'fgMuted',
  cursor: 'pointer',
  _hover: { color: 'accent' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
    borderRadius: 'sm',
  },
});

const kbdStyles = css({
  fontFamily: 'mono',
  fontSize: 'xs',
  paddingInline: '5px',
  paddingBlock: '1px',
  borderRadius: 'sm',
  bg: 'surfaceElevated',
  border: '1px solid token(colors.border)',
  color: 'fgMuted',
});

const verdictRowStyles = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 'sm',
});

const verdictButtonBase = css({
  minHeight: '64px',
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  paddingInline: 'md',
  paddingBlock: 'sm',
  fontFamily: 'body',
  fontSize: 'body',
  fontWeight: 'semibold',
  borderRadius: '10px',
  cursor: 'pointer',
  transition: 'background-color 120ms ease-out, border-color 120ms ease-out, opacity 120ms ease-out',
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
});

const verdictBadStyles = css({
  bg: 'terra.50',
  color: 'fg',
  border: '1px solid token(colors.terra.200)',
  _hover: { bg: 'terra.100' },
});

const verdictSkipStyles = css({
  bg: 'surfaceMuted',
  color: 'fg',
  border: '1px solid token(colors.border)',
  _hover: { bg: 'neutral.300' },
});

const verdictGoodStyles = css({
  bg: 'primary.100',
  color: 'fg',
  border: '1px solid token(colors.primary.300)',
  _hover: { bg: 'primary.200' },
});

const signalerStyles = css({
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: 'body',
  fontSize: 'sm',
  color: 'fgMuted',
  cursor: 'pointer',
  _hover: { color: 'error' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
    borderRadius: 'sm',
  },
});

const correctifBoxStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'sm',
  border: '1px solid token(colors.accent)',
  borderRadius: 'md',
  padding: 'md',
  bg: 'surface',
});

const correctifTextareaStyles = css({
  fontSize: 'body',
  fontFamily: 'body',
  color: 'fg',
  bg: 'transparent',
  border: '1px solid token(colors.border)',
  borderRadius: 'sm',
  padding: 'sm',
  minHeight: '64px',
  resize: 'vertical',
});

const correctifHintStyles = css({ fontSize: 'sm', color: 'fgMuted', margin: 0 });

const correctifActionsStyles = css({
  display: 'flex',
  gap: 'sm',
  justifyContent: 'flex-end',
});

const correctifButtonStyles = css({
  paddingInline: 'md',
  paddingBlock: 'sm',
  borderRadius: 'sm',
  fontSize: 'sm',
  fontWeight: 'semibold',
  cursor: 'pointer',
});

const cancelButtonStyles = css({
  bg: 'surfaceMuted',
  color: 'fg',
  border: '1px solid token(colors.border)',
});

const submitButtonStyles = css({
  bg: 'accent',
  color: 'onAccent',
  border: '1px solid token(colors.accent)',
  _hover: { bg: 'primary.400' },
});

function AnnouncedDifficulty({ value }: { value: number }) {
  return (
    <span className={announcedWrapStyles}>
      Difficulté annoncée
      <span className={announcedDotsStyles} role="img" aria-label={`${value} sur 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={n <= value ? cx(announcedDotStyles, announcedDotFilledStyles) : announcedDotStyles}
          />
        ))}
      </span>
    </span>
  );
}

export interface RatingCardProps {
  readonly item: SurveyItem;
  readonly onVerdict: (
    verdict: Verdict,
    latencyMs: number,
    meta: RatingMeta,
    difficulte: LikertScore,
  ) => Promise<void> | void;
  readonly onCorriger: (
    correctedText: string,
    pos: SurveyPos,
    latencyMs: number,
    meta: RatingMeta,
    difficulte: LikertScore,
  ) => Promise<void> | void;
  readonly onSignaler?: (latencyMs: number) => Promise<void> | void;
  readonly disabled?: boolean;
  readonly enrichable?: boolean;
  readonly surveyClient?: SurveyClient | null;
}

export function RatingCard({
  item,
  onVerdict,
  onCorriger,
  onSignaler,
  disabled = false,
  enrichable = false,
  surveyClient,
}: RatingCardProps) {
  const startedAtRef = useRef<number>(0);
  const [correctifText, setCorrectifText] = useState<string | null>(null);
  const [correctifPos, setCorrectifPos] = useState<SurveyPos>(item.pos);

  const band = useMetadataBand(item);
  const lemmaMeta = useLemmaMeta(surveyClient ?? null, item.mot);
  const priorSenses = lemmaMeta.data?.priorSenses ?? EMPTY_LIST;
  const priorSubTags = lemmaMeta.data?.priorSubTags ?? EMPTY_LIST;

  function currentMeta(): RatingMeta {
    return {
      targetCategories: band.values.targetCategories,
      targetSense: band.values.targetSense,
      isMultisense: band.values.isMultisense,
      subTags: band.values.subTags,
    };
  }

  useEffect(() => {
    setCorrectifText(null);
    setCorrectifPos(item.pos);
  }, [item.itemId, item.pos]);

  // Lock arriving mid-correction collapses any open panel so the disabled state stays consistent.
  useEffect(() => {
    if (disabled) setCorrectifText(null);
  }, [disabled]);

  const currentMetaRef = useRef(currentMeta);
  currentMetaRef.current = currentMeta;

  useEffect(() => {
    startedAtRef.current = performance.now();
  }, [item.itemId]);

  const { toggleExpanded, primaryAction, difficulteForSubmit } = band;

  useEffect(() => {
    function handler(event: KeyboardEvent): void {
      if (disabled) return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target instanceof Element && target.closest('[role="combobox"], [role="listbox"]')) return;
      if (target?.isContentEditable) return;
      const key = event.key.toLowerCase();
      const latency = () => Math.max(0, Math.round(performance.now() - startedAtRef.current));
      if (key === 'c') {
        event.preventDefault();
        setCorrectifText(item.definition);
        return;
      }
      if (key === 's' && onSignaler) {
        event.preventDefault();
        void onSignaler(latency());
        return;
      }
      if (key === 'a' && enrichable) {
        event.preventDefault();
        toggleExpanded();
        return;
      }
      if (key === ' ' && enrichable) {
        event.preventDefault();
        primaryAction();
        return;
      }
      const verdict: Verdict | null = key === 'j' ? 'BAD' : key === 'k' ? 'SKIP' : key === 'l' ? 'GOOD' : null;
      if (verdict === null) return;
      event.preventDefault();
      void onVerdict(verdict, latency(), currentMetaRef.current(), difficulteForSubmit);
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [item.itemId, item.definition, onVerdict, onSignaler, disabled, enrichable, toggleExpanded, primaryAction, difficulteForSubmit]);

  function submit(verdict: Verdict): void {
    if (disabled) return;
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAtRef.current));
    void onVerdict(verdict, latencyMs, currentMeta(), band.difficulteForSubmit);
  }

  function submitCorrectif(): void {
    if (correctifText === null) return;
    const trimmed = correctifText.trim();
    const textChanged = trimmed.length > 0 && trimmed !== item.definition.trim();
    const posChanged = correctifPos !== item.pos;
    if (!textChanged && !posChanged) {
      setCorrectifText(null);
      return;
    }
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAtRef.current));
    const text = textChanged ? trimmed : item.definition;
    setCorrectifText(null);
    void onCorriger(text, correctifPos, latencyMs, currentMeta(), band.difficulteForSubmit);
  }

  return (
    <article className={cardStyles} aria-live="polite" data-testid="rating-card">
      <div className={topRowStyles}>
        <label className={css({ srOnly: true })} htmlFor="pos-pill">Nature grammaticale</label>
        <select
          id="pos-pill"
          className={posSelectStyles}
          data-testid="pos-pill"
          value={correctifPos}
          disabled={disabled}
          onChange={(e) => setCorrectifPos(e.target.value as SurveyPos)}
        >
          {POS_OPTIONS.map((pos) => (
            <option key={pos} value={pos}>{posLabel(pos)}</option>
          ))}
        </select>
        <StyleTooltip style={item.style} definition={item.definition} mot={item.mot} />
        <AnnouncedDifficulty value={item.forceClaimed} />
      </div>

      <h2 className={titleStyles}>{item.mot}</h2>
      <blockquote className={definitionStyles}>« {item.definition} »</blockquote>

      {correctifText === null ? (
        disabled ? null : (
          <button
            type="button"
            className={corrigerTriggerStyles}
            data-testid="corriger-trigger"
            onClick={() => setCorrectifText(item.definition)}
          >
            <span aria-hidden="true">✎</span> Corriger la définition <kbd className={kbdStyles}>C</kbd>
          </button>
        )
      ) : null}

      <div className={verdictRowStyles} role="group" aria-label="Verdict" aria-keyshortcuts="j k l">
        <button
          type="button"
          className={cx(verdictButtonBase, verdictBadStyles)}
          aria-label={`Mauvaise définition pour l'indice « ${item.definition} »`}
          aria-disabled={disabled || undefined}
          data-verdict="BAD"
          onClick={() => submit('BAD')}
        >
          <span>Mauvaise</span>
          <kbd className={kbdStyles}>J</kbd>
        </button>
        <button
          type="button"
          className={cx(verdictButtonBase, verdictSkipStyles)}
          aria-label={`Passer l'indice « ${item.definition} »`}
          aria-disabled={disabled || undefined}
          data-verdict="SKIP"
          onClick={() => submit('SKIP')}
        >
          <span>Passer</span>
          <kbd className={kbdStyles}>K</kbd>
        </button>
        <button
          type="button"
          className={cx(verdictButtonBase, verdictGoodStyles)}
          aria-label={`Bonne définition pour l'indice « ${item.definition} »`}
          aria-disabled={disabled || undefined}
          data-verdict="GOOD"
          onClick={() => submit('GOOD')}
        >
          <span>Bonne</span>
          <kbd className={kbdStyles}>L</kbd>
        </button>
      </div>

      {onSignaler && !disabled ? (
        <button
          type="button"
          className={signalerStyles}
          data-testid="signaler"
          onClick={() => onSignaler(Math.max(0, Math.round(performance.now() - startedAtRef.current)))}
        >
          <span aria-hidden="true">⚐</span> Signaler <kbd className={kbdStyles}>S</kbd>
        </button>
      ) : null}

      {correctifText !== null ? (
        <div className={correctifBoxStyles} data-testid="correctif-box">
          <label htmlFor="correctif-text" className={correctifHintStyles}>
            Proposez une définition corrigée. Soumise comme nouvelle entrée notée « bonne » automatiquement.
          </label>
          <textarea
            id="correctif-text"
            className={correctifTextareaStyles}
            value={correctifText}
            onChange={(e) => setCorrectifText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitCorrectif();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setCorrectifText(null);
              }
            }}
            autoFocus
          />
          <div className={correctifActionsStyles}>
            <button
              type="button"
              className={cx(correctifButtonStyles, cancelButtonStyles)}
              onClick={() => setCorrectifText(null)}
            >
              Annuler
            </button>
            <button
              type="button"
              className={cx(correctifButtonStyles, submitButtonStyles)}
              data-testid="correctif-submit"
              onClick={submitCorrectif}
            >
              Soumettre la correction
            </button>
          </div>
        </div>
      ) : null}

      {enrichable && !disabled ? (
        <MetadataBand
          band={band}
          item={item}
          senseSuggestions={priorSenses}
          subTagSuggestions={priorSubTags}
        />
      ) : null}
    </article>
  );
}
