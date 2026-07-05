# ADR-0097: Private clue corpus — Hetzner Object Storage, not the public repo/image

## Status
Proposed

## Context
The clue corpus — `grid/infrastructure/src/main/resources/words/words-fr.csv`
(~120k rows) plus the themed overlays (`words/themed/*.csv`) — is the full set of
mots-fléchés **definitions**. Today it is:

- committed to the **public** `wordsparrow` repo (ADR-0013 §8: "CSV in repo is the
  production source of truth"), and
- baked into the **public** GHCR image at build time (classpath resource read by
  `CsvWordRepository.frenchFromClasspath()`).

Both artefacts are public, so the entire definition set is **bulk-downloadable** —
`git clone` or `docker pull` yields every answer's clue at once, which defeats the
puzzle. The same applies to the training/eval clue traces under `data/curated/` and
`data/eval/`.

Per-puzzle clue exposure through the API (a served grid necessarily reveals its own
~100 clues) is **inherent and acceptable** — it is piecemeal. The leak this ADR
closes is **bulk** access to the whole corpus via the repo or the image.

ADR-0013 §8 chose committed-CSV-in-repo for determinism, auditability, and
reproducibility. That predates the leak concern; those properties can be kept while
removing public exposure.

## Decision
1. **Source of truth moves to a private repo.** `words-fr.csv`, the themed overlays,
   and the clue training/eval data (`data/curated/` clue files, `data/eval/*`, the
   `generation-gold-2000` bucket) move to a **private** GitHub repo
   (`wordsparrow-clue-data`). They are removed from the public repo, and its history
   is scrubbed (`git filter-repo`) so past commits no longer carry them.
2. **Runtime delivery via private object storage.** The corpus is stored in a
   **private Hetzner Object Storage bucket** (S3-compatible, same region as the k3s
   cluster). `grid-api` and `grid-worker` fetch it at startup via a new
   `CsvWordRepository.fromStream(...)` factory and a small S3 client, using a
   **scoped, read-only** access key delivered as a k8s Secret. The public image no
   longer contains the corpus.
3. **Sync.** On change in the private repo, a job (CI with bucket-write creds, or a
   Helm `post-upgrade` Job per the configure-in-cluster pattern) uploads the CSVs to
   the bucket. The bucket is a deployment cache; the private repo remains the
   git-diffable source of truth.
4. **Startup resilience.** The last-good corpus is cached on a small PVC; a transient
   object-storage error falls back to the cached copy so pods still boot. A cold start
   with no cache and no bucket is the only hard-fail (alertable).
5. **Provisioning.** Bucket + a least-privilege key pair (read-only for the apps,
   write for the sync job) are OpenTofu resources in `terraform/` (ADR-0010/0011);
   keys are inventoried in `docs/secrets.md`.

This **supersedes ADR-0013 §8**: the production read path is no longer the classpath
CSV; it is the Hetzner bucket, sourced from the private repo.

## Threat model
- **Asset:** the complete clue/definition corpus.
- **Threat:** bulk exfiltration that trivialises the puzzle.
- **Before:** public repo + public image → anyone can download the whole corpus.
- **After:** corpus exists only in the private repo and the private bucket. Runtime
  access is gated by a scoped, rotatable S3 key (k8s Secret; apps get read-only, the
  sync path gets write). No public artefact contains it. **Residual, accepted:**
  per-puzzle clues via the API (piecemeal, inherent). **Key compromise:** rotate the
  key via OpenTofu; the bucket has no public ACL, so a leaked read key exposes at
  most the corpus, not write access.
- **Preserved from §8:** determinism/auditability — the private repo still diffs in
  git and reproduces byte-for-byte; the bucket only mirrors it.

## Consequences
- **Easier:** no bulk leak; corpus rotates without image rebuilds; public repo and
  image stay clean.
- **Harder:** a runtime dependency on object storage (mitigated by the cached
  fallback) and a startup fetch; one more credential to manage; the corpus no longer
  diffs in the *public* repo (it diffs in the private one).
- **Licensing (ADR-0058):** the word list is grammalecte-derived (MPL-2.0), clues are
  bliss-authored (CC0). Moving to private storage only *reduces* distribution; MPL-2.0
  source-availability obligations bind on distribution and are unaffected. No new
  external data source is introduced.
- **History scrub** force-pushes public `main`, invalidating existing clones/forks and
  requiring open PRs to rebase — a one-time, announced disruption.
