# ADR-0073: Sample-words endpoint for the home teaser

## Status

Accepted

## Context

The dev-only `/home` route ships a teaser mini-game: a handful of short
mots-fléchés cells the visitor can solve in a few seconds, as a taste of
the real grid. It needs real 3–6 letter French clue→answer pairs to be
anything other than a mock.

Two facts constrain how those pairs can be sourced:

- **The grid wire deliberately omits answer letters.** Since PR #218 the
  domain `LetterCell` carries no solution; the only authoritative check a
  client can do is a server round-trip through `PuzzleSolver`. That design
  is correct for the daily puzzle — the answer key must not leak — but it
  means the existing puzzle/daily/session endpoints expose no answer text
  a client could validate a teaser against locally.
- **No words/clue endpoint exists in the grid API.** The grid context
  serves puzzles, the daily puzzle, and sessions; there is no route that
  returns word+clue pairs. So the teaser is currently hardcoded in the
  frontend.

Hardcoding is a placeholder, not a source. This ADR decides how to source
the teaser pairs for real. The corpus already resident in the api process
is the obvious supply: `grid/api/src/main/kotlin/com/bliss/grid/api/Module.kt:192`
constructs `CsvWordRepository.frenchFromClasspath()` — the same
`WordRepository` puzzle generation reads from. The words and clues in that
corpus already drive generation, and the clues already ship to clients
inside generated puzzles. What is new is exposing the **answer** alongside
the clue, in plaintext, for a small random sample.

## Decision

### 1. New route: `GET /v1/words/sample?minLen&maxLen&count`

Add a single read-only endpoint to the **grid** context returning an array
of `SampleWord { clue, answer }` pairs:

```
GET /v1/words/sample?minLen=3&maxLen=6&count=5
→ 200 [ { "clue": "...", "answer": "PARIS" }, ... ]
```

`SampleWord` carries exactly two string fields. `answer` is the corpus
word's folded surface form (A–Z uppercase, per the `Word.text` invariant);
`clue` is one `WordClue.text` for that word.

### 2. Data source: the resident `WordRepository`

The handler reads from the same `WordRepository` instance generation uses —
the `CsvWordRepository` already loaded at boot (Module.kt:192). For each
length `L` in `minLen..maxLen` it calls `WordRepository.findByLength(L)`,
unions the results, **dedupes by `Word.lemma`** (so inflected forms of one
headword don't crowd the sample), and picks one `WordClue.text` per chosen
word. No new table, no migration, no seed job, no per-request LLM call.

### 3. Plaintext answer, because the teaser validates client-side

The endpoint returns the answer word in plaintext. This is a deliberate
departure from the daily-puzzle posture, justified by the teaser's nature:

- There is **no per-clue server validation endpoint**, and adding one is
  the wrong shape for a micro-game — a `PuzzleSolver` round-trip per
  keystroke is latency and infrastructure the teaser does not warrant.
- The sample is a **random teaser pool, explicitly NOT the daily answer
  key.** These words are drawn at random from the general corpus; exposing
  them does not leak any daily solution. The daily endpoint's letter-
  omission posture (PR #218) is untouched and still binding for that path.

So the teaser validates client-side against the returned `answer`, and the
authoritative-no-leak posture stays scoped to the daily puzzle where it
matters.

### 4. Server-side bounds (binding on the W2 schema and W3 producer)

The endpoint MUST bound its inputs server-side:

- `count` is capped to a small maximum (the schema sets the ceiling; the
  handler clamps). An unbounded `count` would let a caller drain the
  corpus answer-by-answer.
- `minLen`/`maxLen` are bounded to the teaser's range and `minLen ≤ maxLen`
  is enforced; out-of-range or inverted requests are rejected.

No auth is required: the endpoint is public, like the daily puzzle. It
returns no PII.

### 5. Licensing posture (ADR-0058)

This decision exposes corpus answers (not just clues) over the wire for the
first time, so it must be honest about ADR-0058 rather than assert a
clearance it cannot verify.

What is already settled by ADR-0058 and prior practice:

- The corpus words derive from **Hunspell-fr (MPL 2.0)** per ADR-0013 —
  permissive, redistribution permitted with notice. The words themselves
  carry no commercial-license obstacle to being served.
- The **clues** are net-new LLM-generated text and already ship to clients
  inside generated puzzles; serving one clue per sampled word is not a new
  category of exposure.
- ADR-0058's distribution discipline is about **DBnary (CC BY-SA) gloss/
  synonym text not landing in deployed artifacts**, and about verbatim
  re-emission of SA-tainted source text. The sampled `answer` is a
  dictionary surface form (Hunspell-fr), not DBnary text.

What this ADR does **not** assert: blanket clearance to expose corpus
answers "wholesale". The exposure here is deliberately **bounded** — a
small, count-capped, random sample for a dev-only teaser — and that bound
is part of the decision (§4), not incidental. The following is recorded as
a **condition**, not as resolved clearance:

> **Condition (carry into W2/W3).** Before the sample endpoint is promoted
> beyond the dev-only `/home` teaser — e.g. exposed on a production route,
> uncapped, or extended to return additional corpus-derived fields (POS,
> sense, synonym, anything DBnary-derived) — the maintainer confirms per
> the ADR-0058 matrix that the specific fields exposed carry no SA/NC
> source. The current decision is clear for `{clue, answer}` over the
> Hunspell-fr surface + LLM clue; it does not pre-clear fields drawn from
> SA/NC sources.

This is the honest posture: the narrow `{clue, answer}` exposure is sound
under the ADR-0058 matrix as grounded above; anything wider is gated on a
per-source review, recorded here so a later workstream does not read this
ADR as wholesale clearance.

## Consequences

### Easier

- The teaser stops being hardcoded: it draws real clue→answer pairs from
  the production corpus.
- **Cheap.** Reuses the `WordRepository` already resident in the api
  process. No new table, no migration, no seed job, no batch worker, no
  per-request LLM call.
- Client-side validation keeps the micro-game responsive — no round-trip
  per keystroke.

### Harder

- The endpoint owns two new server-side invariants (count cap, length-range
  bound) that the W3 producer and its tests must enforce; an uncapped or
  inverted-range request must be rejected, not silently served.
- Exposing answers over the wire adds a surface that future reviewers must
  keep scoped to the teaser — the §5 condition exists precisely so the
  endpoint is not quietly widened into a corpus-answer firehose.

### Different

- This is the first grid route to return corpus **answers** in plaintext.
  The daily-puzzle no-leak posture (PR #218) is unchanged and remains the
  rule for the daily path; the teaser is a separate, explicitly-random
  pool.
- Schema-first implementation follows in dependency order per ADR-0001 §7
  and ADR-0003 §1:
  - **W2** — schema-only PR adding `/v1/words/sample` + `SampleWord` to
    `grid/api/openapi.yaml`, merged first.
  - **W3** — grid producer: the Ktor route + handler reading the resident
    `WordRepository`, with the §4 bounds and tests.
  - **W4** — frontend consumer: regenerate types
    (`frontend/src/infrastructure/api/grid/types.ts`), an application-layer
    client, and the `/home` teaser wired to the live endpoint.
