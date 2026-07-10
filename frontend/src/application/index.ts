// Frontend application layer. Per ADR-0002 §7, this layer holds use-cases
// and ports orchestrating domain types and infrastructure ports. It
// depends on `domain/` only; concrete adapters live in `infrastructure/`.
export type {
  DailySummariesPage,
  DailySummary,
  FilledCellInput,
  HintDirection,
  HintErrorKind,
  HintResult,
  RevealedWordCell,
  ListDailySummariesOptions,
  PuzzleRepository,
  PuzzleSolver,
  ValidationResult,
  VerifyCellVerdict,
  VerifyErrorKind,
  VerifyResult,
} from './puzzle';
export { HintRequestError, VerifyRequestError } from './puzzle';
export { fetchAllDailySummaries } from './puzzle';
export type {
  SampleWord,
  SampleWordsOptions,
  WordsRepository,
} from './words';
export type {
  AuthClient,
  GetMeResult,
  LinkedProvider,
  WhoAmIResult,
} from './auth';
export { InvalidDisplayNameError } from './auth';
export type { ApiErrorCode } from './errors';
export { apiErrorCode } from './errors';
