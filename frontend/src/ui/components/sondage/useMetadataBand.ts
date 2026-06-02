// Tri-state metadata for /contribuer (ADR-0061, auth-only); "enriched" = human touched/verified.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LikertScore, SurveyCategorie, SurveyItem } from '@/application/survey';

export type BandState = 'pristine' | 'modified' | 'saved';

export interface BandValues {
  readonly targetCategories: ReadonlyArray<SurveyCategorie>;
  readonly targetSense: string;
  readonly isMultisense: boolean;
  readonly subTags: ReadonlyArray<string>;
  readonly perceivedDifficulty: LikertScore | null;
}

export interface MetadataBand {
  readonly state: BandState;
  readonly enriched: boolean;
  readonly values: BandValues;
  readonly expanded: boolean;
  readonly difficulteForSubmit: LikertScore;
  setCategories(next: ReadonlyArray<SurveyCategorie>): void;
  setSense(next: string): void;
  setMultisense(next: boolean): void;
  setSubTags(next: ReadonlyArray<string>): void;
  setPerceivedDifficulty(next: LikertScore): void;
  confirm(): void;
  undoSave(): void;
  reset(): void;
  toggleExpanded(): void;
  primaryAction(): void;
}

const DEFAULT_DIFFICULTE: LikertScore = 3;

function baselineFor(categorie: SurveyCategorie): BandValues {
  return {
    targetCategories: [categorie],
    targetSense: '',
    isMultisense: false,
    subTags: [],
    perceivedDifficulty: null,
  };
}

function sameSet(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

function differsFromBaseline(values: BandValues, baseline: BandValues): boolean {
  return (
    !sameSet(values.targetCategories, baseline.targetCategories) ||
    values.targetSense !== baseline.targetSense ||
    values.isMultisense !== baseline.isMultisense ||
    !sameSet(values.subTags, baseline.subTags) ||
    values.perceivedDifficulty !== baseline.perceivedDifficulty
  );
}

export function useMetadataBand(item: SurveyItem): MetadataBand {
  const baselineRef = useRef<BandValues>(baselineFor(item.categorie));
  const [values, setValues] = useState<BandValues>(baselineRef.current);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Re-seed on card change — mirrors the RatingCard reset effect keyed on itemId.
  useEffect(() => {
    const next = baselineFor(item.categorie);
    baselineRef.current = next;
    setValues(next);
    setSaved(false);
    setExpanded(false);
  }, [item.itemId, item.categorie]);

  const mutate = useCallback((patch: Partial<BandValues>) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, ...patch }));
  }, []);

  const setCategories = useCallback(
    (next: ReadonlyArray<SurveyCategorie>) => mutate({ targetCategories: next }),
    [mutate],
  );
  const setSense = useCallback((next: string) => mutate({ targetSense: next }), [mutate]);
  const setMultisense = useCallback((next: boolean) => mutate({ isMultisense: next }), [mutate]);
  const setSubTags = useCallback(
    (next: ReadonlyArray<string>) => mutate({ subTags: next }),
    [mutate],
  );
  const setPerceivedDifficulty = useCallback(
    (next: LikertScore) => mutate({ perceivedDifficulty: next }),
    [mutate],
  );

  const confirm = useCallback(() => setSaved(true), []);
  const undoSave = useCallback(() => setSaved(false), []);
  const reset = useCallback(() => {
    setSaved(false);
    setValues(baselineRef.current);
  }, []);
  const toggleExpanded = useCallback(() => setExpanded((e) => !e), []);

  const modified = differsFromBaseline(values, baselineRef.current);
  const state: BandState = saved ? 'saved' : modified ? 'modified' : 'pristine';

  const primaryAction = useCallback(() => {
    if (!saved) setSaved(true);
  }, [saved]);

  return useMemo<MetadataBand>(
    () => ({
      state,
      enriched: state !== 'pristine',
      values,
      expanded,
      difficulteForSubmit: values.perceivedDifficulty ?? DEFAULT_DIFFICULTE,
      setCategories,
      setSense,
      setMultisense,
      setSubTags,
      setPerceivedDifficulty,
      confirm,
      undoSave,
      reset,
      toggleExpanded,
      primaryAction,
    }),
    [
      state,
      values,
      expanded,
      setCategories,
      setSense,
      setMultisense,
      setSubTags,
      setPerceivedDifficulty,
      confirm,
      undoSave,
      reset,
      toggleExpanded,
      primaryAction,
    ],
  );
}
