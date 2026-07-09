import {
  HintRequestError,
  VerifyRequestError,
  type FilledCellInput,
  type HintDirection,
  type HintResult,
  type PuzzleSolver,
  type ValidationResult,
  type VerifyResult,
} from '@/application';
import { createGridApiClient, type GridApiClient } from './client';

// HTTP adapter for the application-layer `PuzzleSolver` port. Wraps
// `createGridApiClient` and the two server-authoritative endpoints
// added in PR #218 — `POST /v1/puzzles/{puzzleId}/validate` and
// `POST /v1/puzzles/{puzzleId}/hints`. RFC 7807 problem bodies are
// flattened into a typed `HintRequestError` for the hint flow (so the
// UI can branch on `kind`) and into a flat `Error.message` for the
// validate flow (route loaders render it verbatim). Per ADR-0002 §7
// only this layer may import the generated client; the composition
// root threads an instance through the router context.

export interface HttpPuzzleSolverOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function createHttpPuzzleSolver(
  options: HttpPuzzleSolverOptions | { readonly client: GridApiClient },
): PuzzleSolver {
  const client =
    'client' in options
      ? options.client
      : createGridApiClient({ baseUrl: options.baseUrl, fetch: options.fetch });

  return {
    async validate(
      puzzleId: string,
      filledCells: ReadonlyArray<FilledCellInput>,
    ): Promise<ValidationResult> {
      const { data, error, response } = await client.POST(
        '/v1/puzzles/{puzzleId}/validate',
        {
          params: { path: { puzzleId } },
          // Spread to a plain array so a `ReadonlyArray<…>` caller still
          // satisfies the openapi-fetch mutable-array body type.
          body: { filledCells: [...filledCells] },
        },
      );
      if (error || !data) {
        const detail =
          error?.detail ?? error?.title ?? `HTTP ${response.status}`;
        throw new Error(`puzzle validate failed: ${detail}`);
      }
      return { solved: data.solved };
    },

    async requestHint(
      puzzleId: string,
      row: number,
      column: number,
      direction: HintDirection,
    ): Promise<HintResult> {
      const { data, error, response } = await client.POST(
        '/v1/puzzles/{puzzleId}/hints',
        {
          params: { path: { puzzleId } },
          // credentials only here: /hints needs the identity session cookie; public reads stay anonymous/cacheable.
          credentials: 'include',
          body: { row, column, direction },
        },
      );
      if (error || !data) {
        const detail =
          error?.detail ?? error?.title ?? `HTTP ${response.status}`;
        // Status-code-driven routing is the contract per ADR-0003 §6;
        // we don't parse `error.type` URIs here.
        if (response.status === 429) {
          throw new HintRequestError('budget-exhausted', 0, detail);
        }
        if (response.status === 400) {
          throw new HintRequestError('invalid-coord', null, detail);
        }
        if (response.status === 401) {
          throw new HintRequestError('auth-required', null, detail);
        }
        throw new HintRequestError('transient', null, detail);
      }
      return {
        cells: data.cells.map((c) => ({
          row: c.row,
          column: c.column,
          letter: c.letter,
        })),
        hintsRemaining: data.hintsRemaining,
        secondsUntilNextHint: data.secondsUntilNextHint,
      };
    },

    async verify(
      puzzleId: string,
      cells: ReadonlyArray<FilledCellInput>,
    ): Promise<VerifyResult> {
      const { data, error, response } = await client.POST(
        '/v1/puzzles/{puzzleId}/verify',
        {
          params: { path: { puzzleId } },
          // credentials: /verify needs the identity session cookie, same as /hints (ADR-0099).
          credentials: 'include',
          body: { cells: [...cells] },
        },
      );
      if (error || !data) {
        const detail =
          error?.detail ?? error?.title ?? `HTTP ${response.status}`;
        if (response.status === 429) {
          // The 429 body is a VerifyCooldownProblem; narrow off the error union to read the countdown extension member.
          const seconds =
            error && 'secondsUntilNextVerify' in error
              ? error.secondsUntilNextVerify
              : null;
          throw new VerifyRequestError('cooldown-active', seconds, detail);
        }
        if (response.status === 401) {
          throw new VerifyRequestError('auth-required', null, detail);
        }
        throw new VerifyRequestError('transient', null, detail);
      }
      return {
        cells: data.cells.map((c) => ({
          row: c.row,
          column: c.column,
          correct: c.correct,
        })),
        secondsUntilNextVerify: data.secondsUntilNextVerify,
      };
    },
  };
}
