// Inline-editable metadata band: one compact grid; each field edits in place (ADR-0061, auth-only).

import { useEffect, useRef, useState } from 'react';
import { css } from 'styled-system/css';
import type { SurveyCategorie, SurveyItem, SurveyPos } from '@/application/survey';
import { CATEGORIE_OPTIONS, POS_OPTIONS, categorieLabel, posLabel } from './labels';
import { InlineEditableRow } from './InlineEditableRow';
import { SenseInput } from './SenseInput';
import { GlossChipInput } from './GlossChipInput';
import { PerceivedDifficultyPicker } from './PerceivedDifficultyPicker';
import { StyleTooltip } from './StyleTooltip';
import type { MetadataBand as Band } from './useMetadataBand';

type FieldKey = 'sens' | 'motscles';

const bandStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'sm',
  borderRadius: 'md',
  border: '1px solid token(colors.metaSuggestedLine)',
  bg: 'metaSuggestedBg',
  padding: 'md',
  transition: 'background-color 160ms ease-out, border-color 160ms ease-out',
  '&[data-state="modified"]': { bg: 'metaModifiedBg', borderColor: 'metaModifiedLine' },
  '&[data-state="saved"]': { bg: 'metaSavedBg', borderColor: 'metaSavedLine' },
});

const headerRowStyles = css({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'sm' });

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

const CONTENT_INDENT = 'calc(26px + token(spacing.sm))';

const bodyStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'sm',
  paddingInlineStart: CONTENT_INDENT,
});

const gridStyles = css({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  rowGap: '6px',
  columnGap: 'sm',
  alignItems: 'start',
  margin: 0,
});

// 28px min-height centers key and value on the same baseline regardless of editor height.
const keyStyles = css({
  fontSize: 'xs',
  fontWeight: 'bold',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'metaSuggestedText',
  display: 'flex',
  alignItems: 'center',
  minHeight: '28px',
});

const valStyles = css({
  fontSize: 'sm',
  color: 'fg',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  minHeight: '28px',
});

const difficultyRowStyles = css({ marginBlockStart: '2px' });

const actionsRowStyles = css({ display: 'flex', alignItems: 'center', gap: 'sm', marginBlockStart: '2px' });

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
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px' },
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
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px', borderRadius: 'sm' },
});

const chipRowStyles = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', margin: 0 });

// The selected-chips row matches the 28px key line so the first chips align with the Catégories label.
const selectedChipRowStyles = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', margin: 0, minHeight: '28px' });

const suggestedChipStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  paddingInline: '8px',
  paddingBlock: '3px',
  borderRadius: '999px',
  fontSize: 'xs',
  fontWeight: 'semibold',
  bg: 'accent',
  color: 'onAccent',
  border: '1px solid token(colors.accent)',
  cursor: 'pointer',
  _hover: { bg: 'primary.400' },
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px' },
});

const addedChipStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  paddingInline: '8px',
  paddingBlock: '3px',
  borderRadius: '999px',
  fontSize: 'xs',
  fontWeight: 'semibold',
  bg: 'surface',
  color: 'accent',
  border: '1px solid token(colors.accent)',
  cursor: 'pointer',
  _hover: { bg: 'primary.100' },
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px' },
});

const optionChipStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  paddingInline: '8px',
  paddingBlock: '3px',
  borderRadius: '999px',
  fontSize: 'xs',
  fontWeight: 'medium',
  bg: 'surface',
  color: 'fg',
  border: '1px solid token(colors.border)',
  cursor: 'pointer',
  _hover: { borderColor: 'accent', color: 'accent' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px' },
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
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px', borderRadius: 'sm' },
});

const categoriesEditorStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  flex: '1 1 auto',
  minWidth: 0,
});

// Nature is a native single-select so one click opens the option list (no two-click trigger indirection).
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
  paddingBlock: '3px',
  paddingInlineEnd: '26px',
  minHeight: '28px',
  cursor: 'pointer',
  backgroundImage:
    'linear-gradient(45deg, transparent 50%, token(colors.fgMuted) 50%), linear-gradient(135deg, token(colors.fgMuted) 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 14px) 53%, calc(100% - 9px) 53%',
  backgroundSize: '5px 5px, 5px 5px',
  backgroundRepeat: 'no-repeat',
  _focusVisible: { outline: '2px solid token(colors.focusRing)', outlineOffset: '2px' },
  _disabled: { opacity: 0.5, cursor: 'not-allowed' },
});

const tagListStyles = css({ display: 'inline-flex', flexWrap: 'wrap', gap: '4px', alignItems: 'baseline' });

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

const MAX_CATEGORIES = 6;
const EXCLUSIVE_CATEGORIE: SurveyCategorie = 'autre';

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

export function MetadataBand({
  band,
  item,
  pos,
  onPosChange,
  posDisabled = false,
  senseSuggestions,
  subTagSuggestions,
}: MetadataBandProps) {
  const [openField, setOpenField] = useState<FieldKey | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const snapshotRef = useRef<{
    sense: string;
    subTags: ReadonlyArray<string>;
  } | null>(null);

  // A stale editor from the previous card must not linger after re-seed.
  useEffect(() => { setOpenField(null); setPickerOpen(false); }, [item.itemId]);

  const selected = band.values.targetCategories;
  const selectedSet = new Set(selected);
  const unselected = CATEGORIE_OPTIONS.filter((c) => !selectedSet.has(c as SurveyCategorie));

  function open(field: FieldKey): void {
    snapshotRef.current = {
      sense: band.values.targetSense,
      subTags: band.values.subTags,
    };
    setOpenField(field);
  }
  // Categories and Nature are always-edit and independent of openField, so leave them untouched here.
  function commitField(): void { setOpenField(null); }
  function cancelField(): void {
    const snap = snapshotRef.current;
    if (snap) {
      if (openField === 'sens') band.setSense(snap.sense);
      else if (openField === 'motscles') band.setSubTags(snap.subTags);
    }
    setOpenField(null);
  }

  function toggleCategory(cat: SurveyCategorie): void {
    if (selectedSet.has(cat)) {
      if (selected.length <= 1) return;
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

  const sense = band.values.targetSense.trim();
  const subTags = band.values.subTags;

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
        <dl className={gridStyles}>
          <dt className={keyStyles}>Nature</dt>
          <dd className={valStyles}>
            {/* data-editor-region exempts the native select from the band's Space-to-confirm key handler. */}
            <div data-editor-region="Nature">
              <select
                aria-label="Nature grammaticale"
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
          </dd>

          <dt className={keyStyles}>Style</dt>
          <dd className={valStyles}>
            <StyleTooltip style={item.style} definition={item.definition} mot={item.mot} labelHidden />
          </dd>

          <dt className={keyStyles}>Catégories</dt>
          <dd className={valStyles}>
            {/* Always-edit (like difficulty): chips stay live; data-editor-region keeps Space from confirming the band. */}
            <div
              className={categoriesEditorStyles}
              data-editor-region="Catégories"
              data-testid="band-categories"
            >
              <p className={selectedChipRowStyles}>
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
          </dd>

          <dt className={keyStyles}>Sens</dt>
          <dd className={valStyles}>
            <InlineEditableRow
              label="Sens visé par cette définition"
              isOpen={openField === 'sens'}
              onOpen={() => open('sens')}
              onCommit={commitField}
              onCancel={cancelField}
              triggerAriaLabel={sense ? `Modifier le sens — ${sense}` : 'Ajouter le sens — vide'}
              empty={sense === ''}
              testId="band-edit-sens"
              renderDisplay={() => (sense ? sense : '+ préciser le sens…')}
              renderEditor={() => (
                <SenseInput
                  value={band.values.targetSense}
                  onChange={band.setSense}
                  suggestions={senseSuggestions}
                  label="Sens visé par cette définition"
                  labelHidden
                  placeholder="ex. saison entre l’été et l’hiver…"
                  bannedTerm={item.mot}
                  autoFocus
                />
              )}
            />
          </dd>

          <dt className={keyStyles}>Mots-clés</dt>
          <dd className={valStyles}>
            <InlineEditableRow
              label="Mots-clés"
              isOpen={openField === 'motscles'}
              onOpen={() => open('motscles')}
              onCommit={commitField}
              onCancel={cancelField}
              triggerAriaLabel={subTags.length > 0 ? `Modifier les mots-clés — ${subTags.join(', ')}` : 'Ajouter des mots-clés — vide'}
              empty={subTags.length === 0}
              testId="band-edit-motscles"
              renderDisplay={() => (subTags.length > 0 ? <span className={tagListStyles}>{subTags.join(', ')}</span> : '+ ajouter…')}
              renderEditor={() => (
                <GlossChipInput
                  value={[...subTags]}
                  onChange={band.setSubTags}
                  suggestions={subTagSuggestions}
                  ariaLabel="Mots-clés"
                  placeholder="+ ajouter…"
                  maxItems={12}
                  maxLength={40}
                  autoFocus
                />
              )}
            />
          </dd>

        </dl>

        <div className={difficultyRowStyles}>
          <PerceivedDifficultyPicker
            value={band.values.perceivedDifficulty}
            onChange={band.setPerceivedDifficulty}
            announced={item.forceClaimed}
          />
        </div>

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
            className={resetButtonStyles}
            data-testid="band-reset"
            disabled={band.state === 'pristine' && pos === item.pos}
            onClick={() => { setOpenField(null); band.reset(); onPosChange(item.pos); }}
          >
            <span aria-hidden="true">↺</span> Réinitialiser
          </button>
        </div>
      </div>
    </section>
  );
}
