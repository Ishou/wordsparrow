// `answer` is uppercase A–Z (ADR-0073 surface form invariant).
export interface SampleWord {
  readonly clue: string;
  readonly answer: string;
}

export interface SampleWordsOptions {
  readonly minLen?: number;
  readonly maxLen?: number;
  readonly count?: number;
}

// Port for teaser words (ADR-0073); adapters live in infrastructure/.
export interface WordsRepository {
  fetchSampleWords(opts?: SampleWordsOptions): Promise<ReadonlyArray<SampleWord>>;
}
