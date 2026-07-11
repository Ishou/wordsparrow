# ADR-0104: CI-driven OpenTofu apply via a gated workflow

## Status

Accepted

## Context

`terraform/k8s/` (the Hetzner k3s cluster, ADR-0009/0010/0011) is applied
**manually**: a maintainer runs `tofu -chdir=terraform/k8s apply` from a
workstation that holds the `HCLOUD_TOKEN`, the `bliss-tf-state` S3-backend
credentials, and the prod tfvars (`worker_count`, node sizes, ssh keys, …).
None of that lives in the repo.

This blocks delegation. A routine capacity change — e.g. ADR-0101 R1, bump
`worker_count` 1→3 — cannot be executed by anyone (human or agent) without
the maintainer's local environment. GitHub **secrets are write-only**
(`gh secret` has no `get`), so the token cannot be handed to another operator
or read into a session; and it *should not* be — pasting a live cloud token
into a shell or chat is a credential-exposure anti-pattern.

ADR-0011 already anticipated "any future workflow that runs OpenTofu against
prod" (it scoped only a `fmt`/`validate` PR check as near-term). A **gated
apply workflow** is the missing piece: it keeps the token inside GitHub
Actions, makes every infra change a reviewable, approved dispatch, and
removes the single-workstation dependency.

## Decision

Add `.github/workflows/tofu-k8s.yml` — a **manual, two-phase** OpenTofu
runner for `terraform/k8s/`:

- **Trigger:** `workflow_dispatch` only (never push/PR/schedule). Inputs:
  `mode` (`show` / `plan` default / `apply`) and an optional `worker_count`
  override.
- **Show phase:** `mode=show` runs `tofu show` on the current state
  (read-only, no input vars). This recovers the applied config — server
  types, ssh keys, region — when the tfvars are lost, so the repo Variables
  can be set to their exact current values before the first plan. Sensitive
  state values are auto-redacted.
- **Plan phase:** runs freely; prints and uploads the exact plan.
- **Apply phase:** runs only when `mode == apply`, `needs: plan`, and is
  gated behind a protected **`prod-infra` GitHub Environment** (required
  reviewers). It applies the *saved* plan artifact, so the approver signs off
  on the identical diff; tofu rejects the plan if state drifted since.
- **Auth:** `HCLOUD_TOKEN` (provider) and `S3_ACCESS_KEY`/`S3_SECRET_KEY`
  (the `bliss-tf-state` backend, ADR-0010) come from existing secrets,
  env-injected. Non-secret variables come from repo **Variables**
  (`TF_CLUSTER_NAME`, `TF_WORKER_COUNT`, `TF_SSH_PUBLIC_KEYS` (JSON), …) so
  no prod value is committed or guessed.
- **Safety:** serialized `concurrency` (one run at a time — the state uses
  the ADR-0010 §2 lock object); `tofu_wrapper: false` and no `-var` echo so
  tokens/state never print.

### Threat model (auth/authz)

- **Capability & blast radius:** the workflow can create/destroy the entire
  prod cluster and read/write tofu state.
- **Actor gate:** `workflow_dispatch` requires repo write; `apply`
  additionally requires a **second human** (a `prod-infra` reviewer) to
  approve after seeing the plan.
- **Diff integrity:** apply consumes the reviewed plan, not a re-plan; a
  drifted state fails the apply rather than silently applying something new.
- **Secret handling:** tokens are env-only; state is never logged; the lock
  object prevents concurrent-run corruption.
- **Residual risk:** a repo-write actor can trigger a `plan` (read-only to
  infra, reads state) unreviewed. Acceptable — plan makes no changes; apply
  is the gated action.
- **Known gap — plan artifact carries the k3s join token in cleartext:**
  the uploaded `tfplan` artifact embeds `random_password.k3s_token.result`
  (the live cluster join token, wired into every node's `cloud-init` via
  `server.tf`). OpenTofu's `sensitive` marking only redacts the
  CLI-rendered plan (`tofu show`); the saved plan *file* itself contains
  the real value, recoverable via `tofu show -json` or a raw string scan.
  Any actor with repo **read** access can download the artifact for its
  5-day retention window — a materially wider blast radius than the
  `workflow_dispatch` repo-write / `prod-infra`-reviewer actor gate above,
  since it bypasses the apply gate entirely. Follow-up needed: stop
  persisting the plan as a downloadable artifact (re-plan inside `apply`
  against the same state, accepting a race window instead of an
  artifact hand-off) or move `k3s_token` out of Terraform-managed state
  (e.g. generate it via a k8s Secret post-bootstrap) so it never lands in
  a plan file.

## Consequences

- **Easier:** infra/capacity changes become a reviewable one-click dispatch;
  the `HCLOUD_TOKEN` stays inside Actions (no workstation or session
  exposure); provisioning is no longer single-operator.
- **Harder / new setup (one-time, see `docs/deploy.md`):** a maintainer must
  create the `prod-infra` Environment with required reviewers and set the
  repo Variables mirroring their tfvars. Until both exist the workflow fails
  fast (missing vars → plan error; no environment → apply cannot be
  approved).
- **Scope:** this covers `terraform/k8s/` only. The root `terraform/`
  (Cloudflare) stays manual; extending the pattern there is a separate
  decision. ADR-0011's manual path remains valid as a fallback.
