// Collapsible metadata band for the /contribuer card. Tri-state (pristine/modified/saved)
// is owned by useMetadataBand; this component is presentation + the category two-zone picker.

import { useState } from 'react';
import { css } from 'styled-system/css';
import type { SurveyCategorie, SurveyItem } from '@/application/survey';
import { CATEGORIE_OPTIONS, categorieLabel } from './labels';
import { SenseInput } from './SenseInput';
import { GlossChipInput } from './GlossChipInput';
import { PerceivedDifficultyPicker } from './PerceivedDifficultyPicker';
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

const toggleCircleStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: '999px',
  border: '1px solid token(colors.metaSuggestedLine)',
  bg: 'surface',
  color: 'metaSuggestedText',
  fontSize: 'body',
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
  _focusVisible: {
    outline: '2px solid token(colors.focusRing)',
    outlineOffset: '2px',
  },
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

const summaryStyles = css({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '4px sm',
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
  margin: '2px 0',
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

export function MetadataBand({
  band,
  item,
  senseSuggestions,
  subTagSuggestions,
}: MetadataBandProps) {
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
        <button
          type="button"
          className={toggleCircleStyles}
          aria-label={band.expanded ? 'Réduire les métadonnées' : 'Développer les métadonnées'}
          aria-expanded={band.expanded}
          onClick={band.toggleExpanded}
        >
          +
        </button>
        <span className={overlineStyles}>
          Métadonnées{' '}
          <span className={overlineNoteStyles}>· optionnel, aide l’entraînement</span>
        </span>
        <span className={badgeStyles} data-state={band.state} data-testid="band-status-badge">
          {badgeText(band.state)}
        </span>
      </div>

      <dl className={summaryStyles} data-testid="band-summary">
        <dt className={summaryKeyStyles}>Catégories</dt>
        <dd className={summaryValStyles}>{categoriesSummary}</dd>
        <dt className={summaryKeyStyles}>Sens</dt>
        <dd className={summaryValStyles}>{senseSummary}</dd>
        <dt className={summaryKeyStyles}>Mots-clés</dt>
        <dd className={summaryValStyles}>{subTagsSummary}</dd>
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
      </div>

      {band.expanded ? (
        <>
          <hr className={dividerStyles} />

          <div className={sectionStyles} data-testid="band-categories">
            <span className={sectionLabelStyles}>
              Catégories{' '}
              <span className={sectionNoteStyles}>— pré-remplies depuis l’indice</span>
            </span>
            <p className={chipRowStyles}>
              {selected.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={suggestedChipStyles}
                  data-categorie={cat}
                  aria-label={`Retirer ${categorieLabel(cat)}`}
                  onClick={() => toggleCategory(cat)}
                >
                  ✦ {categorieLabel(cat)}
                </button>
              ))}
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
              label="Mots-clés"
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
    </section>
  );
}
