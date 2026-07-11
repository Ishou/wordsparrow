// Folds a clue's current cell entries into the stable A–Z word identity the
// report wire expects; the solution word never reaches the client (ADR-0076),
// so the player's typed letters are the only available identity.
export function foldReportWord(letters: readonly string[]): string {
  return letters
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}
