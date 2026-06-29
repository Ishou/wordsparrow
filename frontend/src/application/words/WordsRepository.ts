// No plaintext answer (ADR-0076 Wave 4); validation goes through `token` + `verifySample`.
export interface SampleWord {
  readonly clue: string;
  readonly answerLength: number;
  readonly token: string;
}

export interface SampleWordsOptions {
  readonly minLen?: number;
  readonly maxLen?: number;
  readonly count?: number;
}

// Port for teaser words (ADR-0073); adapters live in infrastructure/.
export interface WordsRepository {
  fetchSampleWords(opts?: SampleWordsOptions): Promise<ReadonlyArray<SampleWord>>;
  // Server-side guess check (ADR-0076): the answer never leaves the server in plaintext.
  verifySample(token: string, guess: string): Promise<boolean>;
}
