// Folds cell entries into A–Z word text — the solution never reaches the client (ADR-0076).
export function foldReportWord(letters: readonly string[]): string {
  return letters
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}
