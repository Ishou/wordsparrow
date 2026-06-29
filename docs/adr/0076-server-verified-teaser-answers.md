# ADR-0076: Server-verified teaser answers

## Status

Accepted

## Context

The home-teaser mini-game (ADR-0073) sources its clue→answer pairs from
`GET /v1/words/sample`, which returns `SampleWord { clue, answer }` with the
**answer in plaintext**. ADR-0073 §3 blessed that as a *dev-only* `/home`
exception: the teaser validated client-side, and the pool is a random sample,
never the daily answer key, so no daily solution leaks.

That justification no longer holds. The v2 cutover (ADR-0074) promoted `/home`
and its teaser to production. The plaintext answer now ships to every visitor,
so the mini-game is trivially cheatable from the browser's Network tab — the
`answer` field is right there in the response. This is **not** a daily-puzzle
answer-key leak (the daily path's letter-omission posture, PR #218, is
untouched); it is purely an integrity problem for the teaser itself. The
maintainer wants the answer to never leave the server in plaintext.

ADR-0073 §3's premise — "there is no per-clue server validation endpoint, and
adding one is the wrong shape" — was scoped to a `PuzzleSolver` round-trip per
keystroke. A single stateless equality check per *word attempt* is a different,
cheap shape, and it is what makes server-side validation viable here.

## Decision

### 1. Opaque deterministic token instead of a plaintext answer

`GET /v1/words/sample` returns a `token` per word: an opaque handle
`base64url(HMAC-SHA256(serverKey, normalize(answer)))`. It is **stateless** —
no DB row, no cache entry, no expiry — and **deterministic**: the same answer
always yields the same token. The token reveals nothing about the answer to a
client that does not already know the answer.

`answerLength` (the letter count, 3..6) also ships, so the teaser can render
the right number of cells without the answer.

### 2. Verify endpoint

`POST /v1/words/sample/verify` with body `{ token, guess }` returns
`{ correct: boolean }`. The server recomputes
`HMAC-SHA256(serverKey, normalize(guess))`, base64url-encodes it, and
**constant-time-compares** it to the supplied `token`. Constant-time compare
avoids leaking a per-character timing oracle.

### 3. No plaintext answer, ever; no reveal path

No endpoint returns the plaintext answer going forward. "Reveal on success" is
intentionally **not** a feature: a correct guess already equals the canonical
folded answer (uppercase ASCII A–Z, ADR-0073 §1), so the client that guessed
right already has it. There is no give-up reveal path. The verify response is
therefore just `{ correct }`.

### 4. Threat model: deterministic-token dictionary mapping (accepted)

Because the token is deterministic and unsalted, a determined attacker can
dictionary-map tokens→words by POSTing known French words to `/verify` until
one returns `correct: true`. The corpus is public French words and the teaser
is a throwaway micro-game with no stakes, so this is accepted. The maintainer
explicitly chose this over per-session salting — salting would require server
state (a session→answer map) the stateless design deliberately avoids, for a
surface that does not warrant it. This is recorded as accepted residual risk,
not an open item.

### 5. Server key

`serverKey` is injected at runtime as a k8s Secret (CLAUDE.md secrets posture),
not committed. Provisioning and injection are a Wave-2 concern; this ADR only
fixes that the key is HMAC keying material held server-side.

### 6. Migration: expand-and-contract

The frontend currently reads `SampleWord.answer`; a hard swap breaks its build,
so the migration is expand-and-contract per CLAUDE.md.

- **Wave 1 (this PR, schema-only):** add `answerLength` + `token` to
  `SampleWord` (both required); keep `answer` but make it optional and
  `deprecated`. Add `POST /v1/words/sample/verify` + `SampleVerifyResult`.
  Regenerate the frontend types so the drift gate stays green. No backend or
  frontend logic.
- **Wave 2 (grid backend):** mint `token` + `answerLength` in the sample
  handler; implement the verify handler; wire `serverKey` as a k8s Secret.
- **Wave 3 (frontend rewire):** the teaser uses `token` + `answerLength` and
  calls `/verify`; stop reading `answer`.
- **Wave 4 (contract):** remove `answer` from `SampleWord`; the backend stops
  sending it. The leak fully closes only at this wave.

## Consequences

### Easier

- The answer never leaves the server in plaintext once Waves 2–4 land; the
  teaser stops being a Network-tab cheat.
- Verification is stateless — no session store, cache, or expiry to operate.
- The frontend keeps building across the migration: `answer` stays present
  (optional) until the contract wave.

### Harder

- A correct guess now costs a server round-trip per word attempt (not per
  keystroke). Acceptable for a per-word check; it is the new validation path.
- The deterministic token carries the dictionary-mapping risk in §4 as
  accepted residual risk a future reviewer must not re-open as a bug.
- The leak is only fully closed at Wave 4; Waves 1–3 keep `answer` on the wire
  for backward compatibility, so the cheat persists until the contract wave.

### Different

- This is the first grid route with a server-side per-attempt verify check; the
  daily-puzzle no-leak posture (PR #218) is unchanged and still scoped to the
  daily path.
- ADR-0073 §3's plaintext exception is superseded in part: client-side
  validation is replaced by server verify; the random-pool rationale stands.
