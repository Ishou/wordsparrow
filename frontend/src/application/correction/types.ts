// Ports + types for the maintainer clue-correction surface (ADR-0108); mirrors the grid contract without importing generated types (ADR-0002 §7).

export type CorrectionKind = 'replace' | 'forbid_clue' | 'blocklist_word';

export type BackfillStatus = 'pending' | 'running' | 'done' | 'failed';

export interface ReplaceCorrectionInput {
  readonly kind: 'replace';
  readonly oldClueText: string;
  readonly wordText?: string;
  readonly newClueText: string;
}

export interface ForbidClueCorrectionInput {
  readonly kind: 'forbid_clue';
  readonly oldClueText: string;
  readonly wordText: string;
}

export type CorrectionInput = ReplaceCorrectionInput | ForbidClueCorrectionInput;

// Destructive blocklist path (ADR-0110): drops the word from generation and scrubs it from every stored grid.
export interface BlocklistWordInput {
  readonly kind: 'blocklist_word';
  readonly wordText: string;
  readonly reason?: string;
}

// Dry-run blast radius shown before the typed-word confirm (ADR-0110 §4).
export interface BlocklistPreview {
  readonly affectedDailies: number;
  readonly affectedSolo: number;
}

// Dry-run impact of a clue correction, shown in the Corriger sheet before applying (ADR-0108).
export interface CorrectionPreview {
  readonly affectedDailies: number;
  readonly affectedSolo: number;
}

// The CorrectionKind that a reverse undid, or null when no active correction matched (ADR-0116).
export type ReversedKind = CorrectionKind | null;

// One of a word's corpus clues, offered as an alternate replacement in the Corriger picker (ADR-0108 2026-07-13 amendment).
export interface WordClue {
  readonly text: string;
  readonly theme: string | null;
}

export interface CorrectionAccepted {
  readonly correctionId: string;
  readonly backfillStatus: BackfillStatus;
}

export interface CorrectionProgress {
  readonly correctionId: string;
  readonly kind: CorrectionKind;
  readonly backfillStatus: BackfillStatus;
  readonly gridsMatched: number | null;
  readonly gridsPatched: number;
}

export interface CorrectionClient {
  submitCorrection(input: CorrectionInput): Promise<CorrectionAccepted>;
  getCorrectionProgress(correctionId: string): Promise<CorrectionProgress>;
  blocklistWord(input: BlocklistWordInput): Promise<CorrectionAccepted>;
  previewBlocklist(word: string): Promise<BlocklistPreview>;
  previewCorrection(oldClueText: string, wordText?: string): Promise<CorrectionPreview>;
  reverseCorrection(oldClueText: string, wordText?: string): Promise<ReversedKind>;
  listWordClues(word: string): Promise<ReadonlyArray<WordClue>>;
}
