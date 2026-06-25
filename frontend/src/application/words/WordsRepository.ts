// A single clue→answer teaser pair (ADR-0073). `answer` is the corpus
// word's folded surface form (uppercase ASCII A–Z); the `/home` teaser
// validates typed letters against it client-side.
export interface SampleWord {
  readonly clue: string;
  readonly answer: string;
}

// Length/count bounds for `fetchSampleWords`; all optional. The server
// clamps `count` and rejects an inverted or out-of-range length window.
export interface SampleWordsOptions {
  readonly minLen?: number;
  readonly maxLen?: number;
  readonly count?: number;
}

// Application-layer port for sourcing teaser words from the grid corpus.
// Adapters live in `infrastructure/` (HTTP today); the route receives an
// instance through router context so `ui/` keeps zero `infrastructure/`
// imports per ADR-0002 §7. Failures reject with an `Error.message`.
export interface WordsRepository {
  fetchSampleWords(opts?: SampleWordsOptions): Promise<ReadonlyArray<SampleWord>>;
}
