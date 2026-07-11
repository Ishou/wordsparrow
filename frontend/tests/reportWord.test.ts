import { describe, expect, it } from 'vitest';
import { foldReportWord } from '@/ui/components/grid/reportWord';

describe('foldReportWord', () => {
  it.each([
    [['É', 'L', 'É', 'P', 'H', 'A', 'N', 'T'], 'ELEPHANT', 'uppercase accents'],
    [['é', 'l', 'é'], 'ELE', 'lowercase accents fold + uppercase'],
    [['ç', 'A', 'ï', 'ê'], 'CAIE', 'mixed diacritics'],
    [['a', 'B', 'c'], 'ABC', 'mixed case → uppercase'],
  ])('folds %j → %s (%s)', (letters, expected) => {
    expect(foldReportWord(letters)).toBe(expected);
  });

  it('drops non-letter characters (digit, apostrophe, space)', () => {
    expect(foldReportWord(['A', '1', "'", ' ', 'B'])).toBe('AB');
  });

  it('returns empty string for empty input', () => {
    expect(foldReportWord([])).toBe('');
  });

  it('returns empty string when no cell holds a letter', () => {
    expect(foldReportWord(['', '', ''])).toBe('');
  });

  it('returns empty string when every character is non-A–Z', () => {
    expect(foldReportWord(['1', '2', '!', ' '])).toBe('');
  });
});
