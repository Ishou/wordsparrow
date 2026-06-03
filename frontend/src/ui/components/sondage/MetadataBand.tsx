// Collapsible metadata band: tri-state (pristine/modified/saved) owned by useMetadataBand.

import { useId, useState } from 'react';
import { css, cx } from 'styled-system/css';
import type { SurveyCategorie, SurveyItem, SurveyPos } from '@/application/survey';
import { CATEGORIE_OPTIONS, POS_OPTIONS, categorieLabel, posLabel } from './labels';
import { SenseInput } from './SenseInput';
import { GlossChipInput } from './GlossChipInput';
import { PerceivedDifficultyPicker } from './PerceivedDifficultyPicker';
import { StyleTooltip } from './StyleTooltip';
import type { MetadataBand as Band } from './useMetadataBand';

const bandStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'sm',
  borderRadius: 'md',
  border: '1px solid token(colors.metaSuggestedLine)',
  bg: 'metaSuggestedBg',
  padding: 'md',
  transition: 'background-color 160ms ease-out, border-color 160ms ease-out',
  '&[data-state="modified"]': {
    bg: 'metaModifiedBg',
    borderColor: 'metaModifiedLine',
  },
  '&[data-state="saved"]': {
    bg: 'metaSavedBg',
    borderColor: 'metaSavedLine',
  },
});

const headerRowStyles = css({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 'sm',
});

// Decorative "pré-rempli" marker mirroring the ✦ badge — not an expand control.
const markerCircleStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '26px',
  height: '26px',
  borderRadius: '999px',
  border: '1px solid token(colors.metaSuggestedLine)',
  bg: 'surface',
  color: 'metaSuggestedText',
  fontSize: 'sm',
  lineHeight: 1,
  flexShrink: 0,
});

const overlineStyles = css({
  fontSize: 'xs',
  fontWeight: 'bold',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'fg',
});

const overlineNoteStyles = css({
  fontSize: 'xs',
  color: 'fgMuted',
  fontWeight: 'normal',
  textTransform: 'none',
  letterSpacing: 0,
});

const badgeStyles = css({
  marginInlineStart: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  paddingInline: 'sm',
  paddingBlock: '3px',
  borderRadius: '999px',
  fontSize: 'xs',
  fontWeight: 'semibold',
  bg: 'surface',
  border: '1px solid token(colors.metaSuggestedLine)',
  color: 'metaSuggestedText',
  '&[data-state="modified"]': { borderColor: 'metaModifiedLine', color: 'metaModifiedText' },
  '&[data-state="saved"]': { borderColor: 'metaSavedLine', color: 'metaSavedText' },
});

// Indent past the ✦ marker so the body aligns with the "Métadonnées" title, not the icon.
const CONTENT_INDENT = 'calc(26px + token(spacing.sm))';

const bodyStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'sm',
  paddingInlineStart: CONTENT_INDENT,
});

const summaryStyles = css({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  rowGap: '4px',
  columnGap: 'sm',
  alignItems: 'baseline',
  margin: 0,
});

const summaryKeyStyles = css({
  fontSize: 'xs',
  fontWeight: 'bold',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'metaSuggestedText',
});

const summaryValStyles = css({ fontSize: 'sm', color: 'fg' });

const posSelectStyles = css({
  appearance: 'none',
  fontFamily: 'body',
  fontSize: 'sm',
  fontWeight: 'semibold',
  color: 'fg',
  bg: 'surface',
  border: '1px solid token(colors.border)',
  borderRadius: 'sm',
  paddingInline: 'sm',
  paddingBlock: '6px',
  paddingInlineEnd: '26px',
  cursor: 'pointer',
  alignSelf: 'flex-start',
  backgroundImage:
    'linear-gradient(45deg, transparent 50%, token(colors.fgMuted) 50%), linear-gradient(135deg, token(colors.fgMuted) 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 14px) 53%, calc(100% - 9px) 53%',
  backgroundSize: '5px 5px, 5px 5px',
  backgroundRepeat: 'no-repeat',
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
});

const actionsRowStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: 'sm',
});

const primaryButtonStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'sm',
  paddingInline: 'md',
  paddingBlock: 'sm',
  borderRadius: '6px',
  fontFamily: 'body',
  fontSize: 'body',
  fontWeight: 'bold',
  bg: 'accent',
  color: 'onAccent',
  border: '1px solid token(colors.accent)',
  cursor: 'pointer',
  transition: 'background-color 120ms ease-out, opacity 120ms ease-out',
  _hover: { bg: 'primary.400' },
  _disabled: { opacity: 0.55, cursor: 'default' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
});

const kbdStyles = css({
  fontFamily: 'mono',
  fontSize: 'xs',
  fontWeight: 'normal',
  paddingInline: '5px',
  paddingBlock: '1px',
  borderRadius: 'sm',
  bg: 'rgba(255,255,255,0.25)',
  color: 'inherit',
});

const adjustButtonStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  paddingInline: 'sm',
  paddingBlock: 'sm',
  borderRadius: '6px',
  fontFamily: 'body',
  fontSize: 'sm',
  fontWeight: 'semibold',
  bg: 'transparent',
  color: 'fg',
  border: 'none',
  cursor: 'pointer',
  _hover: { color: 'accent' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
    borderRadius: 'sm',
  },
});

const resetButtonStyles = css({
  marginInlineStart: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  paddingInline: 'sm',
  paddingBlock: 'sm',
  borderRadius: '6px',
  fontFamily: 'body',
  fontSize: 'sm',
  fontWeight: 'semibold',
  bg: 'transparent',
  color: 'fgMuted',
  border: 'none',
  cursor: 'pointer',
  _hover: { color: 'error' },
  _disabled: { opacity: 0.4, cursor: 'default', _hover: { color: 'fgMuted' } },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
    borderRadius: 'sm',
  },
});

const adjustKbdStyles = css({
  fontFamily: 'mono',
  fontSize: 'xs',
  fontWeight: 'normal',
  paddingInline: '5px',
  paddingBlock: '1px',
  borderRadius: 'sm',
  bg: 'surfaceElevated',
  border: '1px solid token(colors.border)',
  color: 'fgMuted',
});

const dividerStyles = css({
  border: 'none',
  borderTop: '1px solid token(colors.metaSuggestedLine)',
  // Bleed back past the body indent so the rule spans the full band width.
  marginBlock: '2px',
  marginInlineStart: 'calc(-1 * (26px + token(spacing.sm)))',
  marginInlineEnd: 0,
  '[data-state="modified"] &': { borderColor: 'metaModifiedLine' },
  '[data-state="saved"] &': { borderColor: 'metaSavedLine' },
});

const sectionStyles = css({ display: 'flex', flexDirection: 'column', gap: '6px' });

const sectionLabelStyles = css({
  fontSize: 'xs',
  fontWeight: 'bold',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'metaSuggestedText',
});

const sectionNoteStyles = css({
  fontWeight: 'normal',
  textTransform: 'none',
  letterSpacing: 0,
  color: 'fgMuted',
});

const chipRowStyles = css({ display: 'flex', flexWrap: 'wrap', gap: 'xs', margin: 0 });

const announcedDotsStyles = css({ display: 'inline-flex', gap: '5px', alignItems: 'center' });

const announcedDotStyles = css({
  width: '11px',
  height: '11px',
  borderRadius: '999px',
  border: '1px solid token(colors.secondary.300)',
  bg: 'transparent',
});

const announcedDotFilledStyles = css({ bg: 'secondary.500', borderColor: 'secondary.500' });

const suggestedChipStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  paddingInline: 'sm',
  paddingBlock: '6px',
  borderRadius: '999px',
  fontSize: 'sm',
  fontWeight: 'semibold',
  bg: 'accent',
  color: 'onAccent',
  border: '1px solid token(colors.accent)',
  cursor: 'pointer',
  _hover: { bg: 'primary.400' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
});

// User-added categories: outline-green pill, distinct from the solid-green pre-filled chips.
const addedChipStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  paddingInline: 'sm',
  paddingBlock: '6px',
  borderRadius: '999px',
  fontSize: 'sm',
  fontWeight: 'semibold',
  bg: 'surface',
  color: 'accent',
  border: '1px solid token(colors.accent)',
  cursor: 'pointer',
  _hover: { bg: 'primary.100' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
});

const optionChipStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  paddingInline: 'sm',
  paddingBlock: '6px',
  borderRadius: '999px',
  fontSize: 'sm',
  fontWeight: 'medium',
  bg: 'surface',
  color: 'fg',
  border: '1px solid token(colors.border)',
  cursor: 'pointer',
  _hover: { borderColor: 'accent', color: 'accent' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
});

const expanderStyles = css({
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 'xs',
  fontWeight: 'semibold',
  color: 'accent',
  cursor: 'pointer',
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
    borderRadius: 'sm',
  },
});

const MAX_CATEGORIES = 6;
const EM_DASH = '—';
// "Autre" is mutually exclusive: it clears every other category and is exempt from the cap.
const EXCLUSIVE_CATEGORIE: SurveyCategorie = 'autre';

const liveRegionStyles = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

export interface MetadataBandProps {
  readonly band: Band;
  readonly item: SurveyItem;
  readonly pos: SurveyPos;
  readonly onPosChange: (next: SurveyPos) => void;
  readonly posDisabled?: boolean;
  readonly senseSuggestions: ReadonlyArray<string>;
  readonly subTagSuggestions: ReadonlyArray<string>;
}

function badgeText(state: Band['state']): string {
  if (state === 'saved') return '✓ Enregistré';
  if (state === 'modified') return '✦ Modifié · à enregistrer';
  return '✦ Pré-rempli · à vérifier';
}

function primaryLabel(state: Band['state']): string {
  if (state === 'saved') return 'Enregistré';
  if (state === 'modified') return 'Enregistrer';
  return 'Confirmer';
}

function AnnouncedDots({ value }: { value: number }) {
  return (
    <span
      className={announcedDotsStyles}
      role="img"
      aria-label={`${value} sur 5`}
      data-testid="band-announced-difficulty"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={n <= value ? cx(announcedDotStyles, announcedDotFilledStyles) : announcedDotStyles}
        />
      ))}
    </span>
  );
}

export function MetadataBand({
  band,
  item,
  pos,
  onPosChange,
  posDisabled = false,
  senseSuggestions,
  subTagSuggestions,
}: MetadataBandProps) {
  const posSelectId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const selected = band.values.targetCategories;
  const selectedSet = new Set(selected);
  const unselected = CATEGORIE_OPTIONS.filter((c) => !selectedSet.has(c as SurveyCategorie));

  function toggleCategory(cat: SurveyCategorie): void {
    if (selectedSet.has(cat)) {
      if (selected.length <= 1) return; // keep at least one category
      band.setCategories(selected.filter((c) => c !== cat));
      setAnnounce(`${categorieLabel(cat)} retirée`);
      return;
    }
    if (cat === EXCLUSIVE_CATEGORIE) {
      const hadOthers = selected.length > 0;
      band.setCategories([cat]);
      setAnnounce(
        hadOthers
          ? `${categorieLabel(cat)} sélectionnée, autres catégories retirées`
          : `${categorieLabel(cat)} ajoutée`,
      );
      return;
    }
    const hadExclusive = selected.includes(EXCLUSIVE_CATEGORIE);
    const base = hadExclusive ? selected.filter((c) => c !== EXCLUSIVE_CATEGORIE) : selected;
    if (base.length >= MAX_CATEGORIES) return;
    band.setCategories([...base, cat]);
    setAnnounce(
      hadExclusive
        ? `${categorieLabel(cat)} ajoutée, ${categorieLabel(EXCLUSIVE_CATEGORIE)} retirée`
        : `${categorieLabel(cat)} ajoutée`,
    );
  }

  const categoriesSummary = selected.map((c) => categorieLabel(c)).join(', ');
  const senseSummary = band.values.targetSense.trim() || EM_DASH;
  const subTagsSummary = band.values.subTags.length > 0 ? band.values.subTags.join(', ') : EM_DASH;

  return (
    <section className={bandStyles} data-state={band.state} data-testid="metadata-band">
      <div className={headerRowStyles}>
        <span className={markerCircleStyles} aria-hidden="true">✦</span>
        <span className={overlineStyles}>
          Métadonnées{' '}
          <span className={overlineNoteStyles}>· optionnel, aide l’entraînement</span>
        </span>
        <span className={badgeStyles} data-state={band.state} data-testid="band-status-badge">
          {badgeText(band.state)}
        </span>
      </div>

      <div className={bodyStyles}>
      <dl className={summaryStyles} data-testid="band-summary">
        <dt className={summaryKeyStyles}>Nature</dt>
        <dd className={summaryValStyles}>{posLabel(pos)}</dd>
        <dt className={summaryKeyStyles}>Style</dt>
        <dd className={summaryValStyles}>
          <StyleTooltip style={item.style} definition={item.definition} mot={item.mot} labelHidden />
        </dd>
        <dt className={summaryKeyStyles}>Catégories</dt>
        <dd className={summaryValStyles}>{categoriesSummary}</dd>
        <dt className={summaryKeyStyles}>Sens</dt>
        <dd className={summaryValStyles}>{senseSummary}</dd>
        <dt className={summaryKeyStyles}>Mots-clés</dt>
        <dd className={summaryValStyles}>{subTagsSummary}</dd>
        <dt className={summaryKeyStyles}>Difficulté</dt>
        <dd className={summaryValStyles}><AnnouncedDots value={item.forceClaimed} /></dd>
      </dl>

      <div className={actionsRowStyles}>
        <button
          type="button"
          className={primaryButtonStyles}
          data-testid="band-primary"
          disabled={band.state === 'saved'}
          onClick={band.primaryAction}
        >
          {primaryLabel(band.state)}
          <kbd className={kbdStyles}>Espace</kbd>
        </button>
        <button
          type="button"
          className={adjustButtonStyles}
          data-testid="band-adjust"
          aria-expanded={band.expanded}
          onClick={band.toggleExpanded}
        >
          {band.expanded ? 'Réduire ▴' : 'Ajuster ▾'}
          <kbd className={adjustKbdStyles}>A</kbd>
        </button>
        <button
          type="button"
          className={resetButtonStyles}
          data-testid="band-reset"
          disabled={band.state === 'pristine'}
          onClick={band.reset}
        >
          <span aria-hidden="true">↺</span> Réinitialiser
        </button>
      </div>

      {band.expanded ? (
        <>
          <hr className={dividerStyles} />

          <div className={sectionStyles} data-testid="band-pos">
            <label htmlFor={posSelectId} className={sectionLabelStyles}>
              Nature grammaticale{' '}
              <span className={sectionNoteStyles}>— catégorie grammaticale du mot</span>
            </label>
            <select
              id={posSelectId}
              className={posSelectStyles}
              data-testid="band-pos-select"
              value={pos}
              disabled={posDisabled}
              onChange={(e) => onPosChange(e.target.value as SurveyPos)}
            >
              {POS_OPTIONS.map((p) => (
                <option key={p} value={p}>{posLabel(p)}</option>
              ))}
            </select>
          </div>

          <div className={sectionStyles} data-testid="band-style">
            <span className={sectionLabelStyles}>
              Style{' '}
              <span className={sectionNoteStyles}>— registre rhétorique de l’indice</span>
            </span>
            <span>
              <StyleTooltip style={item.style} definition={item.definition} mot={item.mot} labelHidden />
            </span>
          </div>

          <div className={sectionStyles} data-testid="band-categories">
            <span className={sectionLabelStyles}>
              Catégories{' '}
              <span className={sectionNoteStyles}>— pré-remplies depuis l’indice</span>
            </span>
            <p className={chipRowStyles}>
              {selected.map((cat) => {
                const prefilled = cat === item.categorie;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={prefilled ? suggestedChipStyles : addedChipStyles}
                    data-categorie={cat}
                    data-prefilled={prefilled}
                    aria-label={`Retirer ${categorieLabel(cat)}${prefilled ? ' (pré-remplie)' : ' (ajoutée)'}`}
                    onClick={() => toggleCategory(cat)}
                  >
                    <span aria-hidden="true">{prefilled ? '✦' : '✓'}</span> {categorieLabel(cat)}
                  </button>
                );
              })}
            </p>
            <button
              type="button"
              className={expanderStyles}
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((o) => !o)}
            >
              {pickerOpen ? '– Réduire les catégories ▴' : '+ Toutes les catégories ▾'}
            </button>
            {pickerOpen ? (
              <p className={chipRowStyles}>
                {unselected.map((opt) => {
                  const cat = opt as SurveyCategorie;
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={optionChipStyles}
                      data-categorie={cat}
                      disabled={cat !== EXCLUSIVE_CATEGORIE && selected.length >= MAX_CATEGORIES}
                      aria-label={`Ajouter ${categorieLabel(cat)}`}
                      onClick={() => toggleCategory(cat)}
                    >
                      {categorieLabel(cat)}
                    </button>
                  );
                })}
              </p>
            ) : null}
            <span role="status" aria-live="polite" aria-atomic="true" className={liveRegionStyles}>
              {announce}
            </span>
          </div>

          <div className={sectionStyles}>
            <span className={sectionLabelStyles}>
              Sens visé par cette définition{' '}
              <span className={sectionNoteStyles}>— le sens exact que l’indice cible</span>
            </span>
            <SenseInput
              value={band.values.targetSense}
              onChange={band.setSense}
              suggestions={senseSuggestions}
              label="Sens visé par cette définition"
              labelHidden
              placeholder="ex. saison entre l’été et l’hiver…"
              bannedTerm={item.mot}
            />
          </div>

          <div className={sectionStyles}>
            <span className={sectionLabelStyles}>
              Mots-clés{' '}
              <span className={sectionNoteStyles}>
                — concepts associés, pour la recherche &amp; l’entraînement
              </span>
            </span>
            <GlossChipInput
              value={[...band.values.subTags]}
              onChange={band.setSubTags}
              suggestions={subTagSuggestions}
              ariaLabel="Mots-clés"
              placeholder="+ ajouter…"
              maxItems={12}
              maxLength={40}
              bannedTerm={item.mot}
            />
          </div>

          <PerceivedDifficultyPicker
            value={band.values.perceivedDifficulty}
            onChange={band.setPerceivedDifficulty}
            announced={item.forceClaimed}
          />
        </>
      ) : null}
      </div>
    </section>
  );
}
