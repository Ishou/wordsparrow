import type { DailySummary, PuzzleRepository } from './PuzzleRepository';

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Pinned before any launch anchor: an omitted `from` means a 31-day window with hasMore scoped to it.
const FROM_FLOOR = '2000-01-01';

// Walks the archive back to the server's launch anchor (100 items/page cap).
export async function fetchAllDailySummaries(
  repo: PuzzleRepository,
  todayIso: string,
): Promise<ReadonlyArray<DailySummary>> {
  const all: DailySummary[] = [];
  let to = todayIso;
  for (;;) {
    const page = await repo.listDailySummaries({ from: FROM_FLOOR, to });
    all.push(...page.items);
    if (!page.hasMore || page.items.length === 0) return all;
    to = dayBefore(page.items[page.items.length - 1].date);
  }
}
