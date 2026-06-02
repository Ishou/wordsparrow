import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMetadataBand } from '@/ui/components/sondage/useMetadataBand';
import type { SurveyItem } from '@/application/survey';

const item = {
  itemId: 'i1', mot: 'AUTOMNE', definition: 'Elle précède l’hiver',
  pos: 'nom_commun', categorie: 'meteo', style: 'cryptique',
  forceClaimed: 3, longueur: 7, tier: 'mid', isCalibration: false,
} satisfies SurveyItem;

describe('useMetadataBand', () => {
  it('starts pristine, not enriched, difficulte defaults to 3', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    expect(result.current.state).toBe('pristine');
    expect(result.current.enriched).toBe(false);
    expect(result.current.values.targetCategories).toEqual(['meteo']);
    expect(result.current.difficulteForSubmit).toBe(3);
  });

  it('editing a field moves pristine → modified and enriches', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.setSense('Saison entre l’été et l’hiver'));
    expect(result.current.state).toBe('modified');
    expect(result.current.enriched).toBe(true);
  });

  it('confirm from pristine → saved (verified, no edits)', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.confirm());
    expect(result.current.state).toBe('saved');
    expect(result.current.enriched).toBe(true);
  });

  it('reset restores baseline and returns to pristine', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.setSubTags(['froid']));
    act(() => result.current.reset());
    expect(result.current.state).toBe('pristine');
    expect(result.current.values.subTags).toEqual([]);
  });

  it('undoSave from saved-with-edits → modified', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.setSense('x'));
    act(() => result.current.confirm());
    expect(result.current.state).toBe('saved');
    act(() => result.current.undoSave());
    expect(result.current.state).toBe('modified');
    expect(result.current.values.targetSense).toBe('x');
  });

  it('undoSave from saved-no-edits → pristine', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.confirm());
    act(() => result.current.undoSave());
    expect(result.current.state).toBe('pristine');
  });

  it('editing after save returns to modified', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.confirm());
    act(() => result.current.setMultisense(true));
    expect(result.current.state).toBe('modified');
  });

  it('perceived difficulty: picking sets value, marks modified, drives submit', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.setPerceivedDifficulty(5));
    expect(result.current.state).toBe('modified');
    expect(result.current.difficulteForSubmit).toBe(5);
  });

  it('reselecting the baseline category set returns to pristine', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.setCategories(['meteo', 'conceptuel']));
    expect(result.current.state).toBe('modified');
    act(() => result.current.setCategories(['meteo']));
    expect(result.current.state).toBe('pristine');
  });

  it('primaryAction confirms unless already saved', () => {
    const { result } = renderHook(() => useMetadataBand(item));
    act(() => result.current.primaryAction());
    expect(result.current.state).toBe('saved');
    act(() => result.current.primaryAction()); // no-op when saved
    expect(result.current.state).toBe('saved');
  });
});
