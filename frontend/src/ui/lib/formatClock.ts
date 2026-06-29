// Shared elapsed-time formatter: rolls into hours past 60 min so a long solve reads as `2:09:47`, not `129:47`.
const twoDigit = new Intl.NumberFormat('fr-FR', { minimumIntegerDigits: 2, useGrouping: false });

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const mm = twoDigit.format(Math.floor((s % 3600) / 60));
  const ss = twoDigit.format(s % 60);
  return hours > 0 ? `${twoDigit.format(hours)}:${mm}:${ss}` : `${mm}:${ss}`;
}
