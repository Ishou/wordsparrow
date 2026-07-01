// MSW request handlers for Cloudflare Pages preview deploys.
//
// Per ADR-0007 §5 and ADR-0009 §7, per-PR previews stay frontend-only:
// the real Grid and Game APIs run only on `main`, so previews would
// otherwise either point at production (data-leak risk + noise on real
// metrics) or 404. These handlers intercept every Grid REST call, every
// Game REST call, and every Game WebSocket connection in the browser
// and replay the spec's contract — exactly the surface the real servers
// will satisfy once consumed end-to-end. Reviewers see real shapes;
// production never gets touched by preview traffic.
//
// The grid fixture is sourced from `./fixtures/puzzle.json`, a 10×10
// French mots-fléchés grid with realistic clue text — this is what
// the dev/preview reviewer sees, and what the e2e harness loads to
// stress-test the FitText layout. The same JSON powers both, so any
// "looks fine in preview, breaks in e2e" drift is impossible. The
// production default is now 15×12 (see PuzzleConstraints.kt); the
// preview fixture stays 10×10 because its value is the curated long-
// clue corpus, not the dimensions — regenerating it at 15×12 would
// require re-running the offline generator and re-curating the clue
// set. Out of scope for this PR.
// (The OpenAPI spec example at `grid/api/examples/get-puzzle-200.json`
// is still the contract source for `tests/http-puzzle-repository.test.ts`
// via the `virtual:grid-api-examples/*` Vite plugin; preview's display
// fixture is intentionally separate so we can swap clue corpora without
// touching the spec.) The game/lobby surface is hand-built in
// `handlers/game.ts` because the game/api spec doesn't ship `examples/`
// payloads yet — the generated TS types are the contract, the WS frames
// mirror `game/api/asyncapi.yaml`.
//
// This module is reached only from `main.tsx` and only when
// `import.meta.env.VITE_MOCK_GRID_API === 'true'` (preview builds). Vite
// tree-shakes the dynamic-import branch — and therefore `msw` and
// these handlers — out of production bundles. Verify with:
//
//   pnpm build && grep -r setupWorker dist/  # → no matches.

import { http, HttpResponse } from 'msw';

import type { components } from '@/infrastructure/api/grid/types';
import puzzleFixtureJson from './fixtures/puzzle.json';

import { gameHandlers, gameWsHandler } from './handlers/game';
import { surveyApiHandlers } from './handlers/survey';

type Puzzle = components['schemas']['Puzzle'];
type Position = components['schemas']['Position'];
type ValidatePuzzleRequest = components['schemas']['ValidatePuzzleRequest'];
type RevealCellHintRequest = components['schemas']['RevealCellHintRequest'];
type PuzzleSummary = components['schemas']['PuzzleSummary'];
type SampleWord = components['schemas']['SampleWord'];
type SampleVerifyResult = components['schemas']['SampleVerifyResult'];

// Preview teaser pool (ADR-0073): stand-in tokens for Wave 2 HMAC minting (ADR-0076).
const sampleAnswerPool: ReadonlyArray<{ clue: string; answer: string }> = [
  { clue: 'Note de musique', answer: 'SOL' },
  { clue: 'Roi des animaux', answer: 'LION' },
  { clue: "Cinquième mois de l'année", answer: 'MAI' },
  { clue: 'Petit félin domestique', answer: 'CHAT' },
  { clue: 'Astre de la nuit', answer: 'LUNE' },
  { clue: 'Fleur aux pétales fins', answer: 'IRIS' },
  { clue: 'Métal qui rouille', answer: 'FER' },
  { clue: 'Le contraire de oui', answer: 'NON' },
  { clue: 'Capitale de la France', answer: 'PARIS' },
  { clue: 'Oiseau qui jacasse', answer: 'PIE' },
];
// No plaintext answer on the wire (ADR-0076): the mock ships only clue + answerLength + token.
const sampleWordPool: ReadonlyArray<SampleWord> = sampleAnswerPool.map(({ clue, answer }) => ({
  clue,
  answerLength: answer.length,
  token: `mock-${answer}`,
}));
// Preview-only token→answer map so the verify handler can echo `{correct}` (the real server HMAC-checks).
const sampleAnswerByToken = new Map(sampleAnswerPool.map(({ answer }) => [`mock-${answer}`, answer]));
const normalizeGuess = (s: string) =>
  s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z]/g, '');

// Cast through `unknown` because Vite's JSON import returns the
// inferred literal type; the cast is structurally validated at runtime
// by MSW returning it through the Grid API client (which has spec-
// generated types).
const puzzleFixture = puzzleFixtureJson as unknown as Puzzle;

// Preview parity for the `/validate` endpoint: extract the canonical
// letter from each fixture letter cell. The wire `LetterCell` no longer
// carries `letter` (PR #218), but the preview JSON does — they are the
// expected answers the player is supposed to type. Used solely by the
// mock handler below; nothing on the contract surface depends on this.
type FixtureLetterCell = { kind: 'letter'; position: Position; letter?: string };
const fixtureLetterByPosition = new Map<string, string>();
for (const cell of puzzleFixtureJson.cells as readonly FixtureLetterCell[]) {
  if (cell.kind !== 'letter' || !cell.letter) continue;
  fixtureLetterByPosition.set(
    `${cell.position.row},${cell.position.column}`,
    cell.letter.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
  );
}
const fixtureLetterCellCount = fixtureLetterByPosition.size;

// Resolve the whole word covering (row, column) along the axis — mirrors the server's placement lookup for preview parity.
function resolveFixtureWord(
  row: number,
  column: number,
  direction: 'across' | 'down',
): ReadonlyArray<{ row: number; column: number; letter: string }> | null {
  const dr = direction === 'down' ? 1 : 0;
  const dc = direction === 'across' ? 1 : 0;
  if (!fixtureLetterByPosition.has(`${row},${column}`)) return null;
  let r = row;
  let c = column;
  while (fixtureLetterByPosition.has(`${r - dr},${c - dc}`)) {
    r -= dr;
    c -= dc;
  }
  const cells: { row: number; column: number; letter: string }[] = [];
  while (fixtureLetterByPosition.has(`${r},${c}`)) {
    cells.push({ row: r, column: c, letter: fixtureLetterByPosition.get(`${r},${c}`)! });
    r += dr;
    c += dc;
  }
  return cells;
}

// Per-puzzle hint counter. Resets on module reload (preview only). The
// real server scopes this per (puzzle, player); for MSW we only need
// the budget-exhaustion transition.
const hintsRemainingByPuzzle = new Map<string, number>();

const HINT_PROBLEM_BUDGET = {
  type: 'https://bliss.example/errors/hint-budget-exhausted',
  title: 'Indices épuisés',
  status: 429,
  detail: 'hintsRemaining: 0',
};
const HINT_PROBLEM_INVALID_COORD = {
  type: 'https://bliss.example/errors/invalid-coord',
  title: 'Coordonnées invalides',
  status: 400,
  detail: 'coordinate is out of bounds or does not point at a letter cell',
};

/**
 * Handlers for every Grid API operation declared in
 * `grid/api/openapi.yaml`. The path patterns use a `*` host prefix so
 * they match both `${VITE_GRID_API_URL}/v1/...` (preview's effective
 * URL) and any same-origin proxy a future ADR introduces.
 */
const gridHandlers = [
  // GET /v1/words/sample — bare SampleWord[] (ADR-0073), clamps count/minLen/maxLen like the server.
  http.get('*/v1/words/sample', ({ request }) => {
    const url = new URL(request.url);
    const minLen = Math.min(Math.max(Number(url.searchParams.get('minLen') ?? 3), 3), 6);
    const maxLen = Math.min(Math.max(Number(url.searchParams.get('maxLen') ?? 6), 3), 6);
    const count = Math.min(Math.max(Number(url.searchParams.get('count') ?? 8), 1), 50);
    const inRange = sampleWordPool.filter(
      (w) =>
        w.answerLength >= Math.min(minLen, maxLen) && w.answerLength <= Math.max(minLen, maxLen),
    );
    return HttpResponse.json(inRange.slice(0, count) satisfies SampleWord[]);
  }),
  // POST /v1/words/sample/verify — preview parity for the server token check (ADR-0076); compares plaintext, mock-only.
  http.post('*/v1/words/sample/verify', async ({ request }) => {
    const { token, guess } = (await request.json()) as { token?: string; guess?: string };
    if (!token || !guess) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Bad Request', status: 400, detail: 'missing token or guess' },
        { status: 400 },
      );
    }
    const answer = sampleAnswerByToken.get(token);
    const correct = answer != null && normalizeGuess(guess) === answer;
    return HttpResponse.json({ correct } satisfies SampleVerifyResult);
  }),
  // GET /v1/puzzles/daily/list — must precede the `/v1/puzzles/daily`
  // and `:puzzleId` handlers (MSW dispatches the first match). Builds a
  // DESC-by-date slice clamped to today UTC and the 2026-01-01 launch
  // anchor; caps at 100 items and reports `hasMore` against the full
  // clamped range, matching the server's envelope contract.
  http.get('*/v1/puzzles/daily/list', ({ request }) => {
    const url = new URL(request.url);
    const fromRaw = url.searchParams.get('from');
    const toRaw = url.searchParams.get('to');
    const launchAnchorMs = Date.parse('2026-01-01T00:00:00Z');
    const todayMs = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const toMs = Math.min(toRaw ? Date.parse(`${toRaw}T00:00:00Z`) : todayMs, todayMs);
    const fromMs = Math.max(
      fromRaw ? Date.parse(`${fromRaw}T00:00:00Z`) : toMs - 31 * 86_400_000,
      launchAnchorMs,
    );
    const items: PuzzleSummary[] = [];
    for (let ms = toMs; ms >= fromMs; ms -= 86_400_000) {
      const date = new Date(ms).toISOString().slice(0, 10);
      const gridNumber = Math.floor((ms - launchAnchorMs) / 86_400_000) + 1;
      items.push({
        id: `00000000-0000-7000-8000-${String(gridNumber).padStart(12, '0')}`,
        date,
        gridNumber,
        difficulty: 'facile',
        totalLetterCells: 28,
      });
      if (items.length >= 100) break;
    }
    const fullRangeDays = Math.floor((toMs - fromMs) / 86_400_000) + 1;
    return HttpResponse.json({ items, hasMore: fullRangeDays > items.length });
  }),

  // GET /v1/puzzles/daily — must match before the `:puzzleId` catch-all
  // below; MSW dispatches the first matching handler. Preview returns the
  // fixture with the requested date's gridNumber + the fixture's default
  // difficulty so the Accueil meta row reads like production.
  http.get('*/v1/puzzles/daily', ({ request }) => {
    const url = new URL(request.url);
    const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
    // Match the server's anchor (2026-01-01 = day 1).
    const epochMs = Date.parse(`${date}T00:00:00Z`);
    const launchEpochMs = Date.parse('2026-01-01T00:00:00Z');
    const gridNumber = Math.floor((epochMs - launchEpochMs) / 86_400_000) + 1;
    return HttpResponse.json({
      ...puzzleFixture,
      difficulty: 'facile',
      gridNumber,
    });
  }),

  http.get('*/v1/puzzles/:puzzleId', ({ params }) => {
    // Echo the requested id back so the round-trip looks realistic
    // (the spec example's hard-coded UUID would otherwise mismatch
    // whatever id the application layer asked for).
    const puzzleId = String(params.puzzleId);
    return HttpResponse.json({ ...puzzleFixture, id: puzzleId });
  }),

  // POST /v1/puzzles/{id}/hints — preview parity: resolve the word at (row, column, direction), decrement the per-puzzle budget, 429 when exhausted, 400 on a non-letter coord.
  http.post('*/v1/puzzles/:puzzleId/hints', async ({ params, request }) => {
    const puzzleId = String(params.puzzleId);
    const body = (await request.json()) as RevealCellHintRequest;
    const word = resolveFixtureWord(body.row, body.column, body.direction);
    if (!word) {
      return HttpResponse.json(HINT_PROBLEM_INVALID_COORD, {
        status: 400,
        headers: { 'content-type': 'application/problem+json' },
      });
    }
    const remaining = hintsRemainingByPuzzle.get(puzzleId) ??
      (puzzleFixture.hintsAllowed ?? 3);
    if (remaining <= 0) {
      return HttpResponse.json(HINT_PROBLEM_BUDGET, {
        status: 429,
        headers: { 'content-type': 'application/problem+json' },
      });
    }
    const next = remaining - 1;
    hintsRemainingByPuzzle.set(puzzleId, next);
    const allowed = puzzleFixture.hintsAllowed ?? 3;
    const secondsUntilNextHint = next < allowed ? 600 : null;
    return HttpResponse.json({ cells: word, hintsRemaining: next, secondsUntilNextHint });
  }),

  // POST /v1/puzzles/{id}/validate — preview parity: a pure binary verdict (ADR-0076 §§7–9), no positional data on the wire.
  http.post('*/v1/puzzles/:puzzleId/validate', async ({ request }) => {
    const body = (await request.json()) as ValidatePuzzleRequest;
    const submitted = new Map<string, string>();
    for (const cell of body.filledCells ?? []) {
      submitted.set(`${cell.row},${cell.column}`, cell.letter);
    }
    let allCorrect = true;
    for (const [key, expected] of fixtureLetterByPosition) {
      if (submitted.get(key) !== expected) {
        allCorrect = false;
        break;
      }
    }
    return HttpResponse.json({
      solved: allCorrect && submitted.size === fixtureLetterCellCount,
    });
  }),
];


// Order matters only for overlap, which we don't have: grid REST is
// `/v1/puzzles/...`, game REST is `/v1/lobbies/...`, game WS is its own
// dimension. The WS link handler is appended last by convention.
//
// Handler groups are exported separately so the composition root can
// install the grid set, the game set, or both depending on env. The
// dev posture (real grid backend on localhost, mocked game-api) wants
// the game set only; preview wants both; production installs neither.
export const gridApiHandlers = gridHandlers;
export const gameApiHandlers = [...gameHandlers, gameWsHandler];
export { surveyApiHandlers };
export const handlers = [...gridApiHandlers, ...gameApiHandlers, ...surveyApiHandlers];
