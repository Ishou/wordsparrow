# Deployment

How Bliss reaches production. The frontend (static bundle) ships to
Cloudflare Workers static assets per
[ADR-0090](./adr/0090-frontend-hosting-workers-static-assets.md), which
amends [ADR-0004](./adr/0004-hello-world-deployment.md); the retired
Pages project serves a 301 redirect until its 2026-08-04 deletion;
the JVM API runs on a self-managed Hetzner k3s cluster per
[ADR-0009](./adr/0009-self-managed-k8s-deployment.md). ADR-0007's
Fly.io deployment was superseded by ADR-0009 and never reached
production; the Fly section that previously lived here is retired.
This file documents the operational binding required by ADR-0004 §7
and ADR-0009.

## Pipeline

`.github/workflows/deploy-frontend.yml` builds `frontend/` on push to `main`
(production: `wrangler deploy` of the assets-only Worker
`wordsparrow-frontend`, custom domains applied from `frontend/wrangler.jsonc`)
or on any PR (preview: `wrangler versions upload`, preview URL posted as a
sticky PR comment). A manual `workflow_dispatch` with `legacy_redirect=true`
publishes the 301 stub to the grace-period Pages project. Cloudflare itself
does not clone the repo.

The grace-period Pages project is still declared as Terraform in
`terraform/`; see `terraform/README.md`.

## Secrets bound by the workflow

Per ADR-0004 §7, the *names and bindings* of secrets live in repo code;
only the *values* are injected at runtime via GitHub Actions Secrets.

| Secret | Bound at | What it is | Secret? |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `cloudflare/wrangler-action` step `apiToken` | Cloudflare API token; scopes below. | Yes |
| `CLOUDFLARE_ACCOUNT_ID` | `cloudflare/wrangler-action` step `accountId` | Cloudflare account UUID. Not secret in itself; stored alongside the token for convenience. | No (but treated as such for symmetry) |
| `GITHUB_TOKEN` | `actions/github-script` preview-comment step | Auto-issued by GitHub Actions; posts/updates the sticky preview-URL comment. | Managed |

## Required Cloudflare API token scopes

When creating the token in the Cloudflare dashboard
(My Profile -> API Tokens -> Create Token, *Custom Token*), grant the
minimum needed for Direct Upload:

- **Account -> Workers Scripts -> Edit** (upload the Worker + assets,
  preview versions).
- **Zone -> Workers Routes -> Edit** on `wordsparrow.io` (the pre-attach
  route conflict check).
- **Zone -> DNS -> Edit** on `wordsparrow.io` (custom-domain attach
  creates the DNS records).
- **Account -> Cloudflare Pages -> Edit** (legacy 301 stub deploys, until
  the 2026-08-04 Pages deletion).
- **User -> Memberships -> Read** (the action verifies token ownership at
  startup).

Hard-won 2026-07-04 rule: after any token change, verify each capability
with a direct API call before trusting the dashboard — the token editor
can silently drop rows, and wrangler's stdout masks API error bodies
(the ADR-0090 cutover burned ~30 min of 522 on exactly this).

Restrict the token's *Account Resources* to the single Cloudflare account
that owns the Pages project. Set an expiry; rotate before it lapses.

Verify the live scope list against Cloudflare's docs at token creation
time — Cloudflare occasionally renames scope groups.

## Pre-deploy maintainer checklist (one-time)

Done once after this PR merges, in this order:

1. Create the Cloudflare API token with the scopes above. Copy the value;
   it is shown once.
2. Bootstrap the Pages project via Terraform:
   ```sh
   export CLOUDFLARE_API_TOKEN=<token from step 1>
   terraform -chdir=terraform/ init
   terraform -chdir=terraform/ apply -var="cloudflare_account_id=<account uuid>"
   ```
   Commit the generated `.terraform.lock.hcl`.
3. Add the same `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as
   *GitHub Actions Secrets* (Repo Settings -> Secrets and variables ->
   Actions -> *New repository secret*).

After step 3, the next push to `main` deploys to production.

## Custom domain (`wordsparrow.io`)

Per ADR-0005 §1, the production domain is `wordsparrow.io`. Since the
ADR-0090 Workers cutover, the attachment is owned by
`frontend/wrangler.jsonc`'s `routes` block, not Terraform:

```jsonc
"routes": [
  { "pattern": "wordsparrow.io", "custom_domain": true },
  { "pattern": "www.wordsparrow.io", "custom_domain": true }
]
```

`.github/workflows/deploy-frontend.yml`'s `wrangler deploy` step (push to
`main`) applies this on every deploy — no separate maintainer step, no
`tofu apply`. Cloudflare-managed custom domains provision and issue SSL
automatically because the zone's nameservers are already on Cloudflare;
there is no CNAME/ALIAS/A record to add by hand, unlike the old Pages
custom-domain flow this replaces.

Terraform's remaining role for `wordsparrow.io` is zone-level only — the
cache ruleset (`terraform/cloudflare-cache-rules.tf`) and the
`api.<custom_domain>` DNS records (`terraform/cloudflare-dns-records.tf`),
both still gated on `var.custom_domain`. That variable is unchanged; only
the two `cloudflare_pages_domain` resources that used to consume it
(`terraform/cloudflare-pages-domain.tf`) are gone.

**To point a fork at a different domain (or skip custom-domain
attachment entirely):** edit or remove the `routes` array in
`frontend/wrangler.jsonc` directly — this is no longer a `tofu apply -var`
flag, since the attachment moved out of Terraform.

## Rollback

Per ADR-0004 §5:

- **Primary:** revert the offending commit on `main` via PR + squash-merge.
  The deploy workflow re-runs and pushes the prior bundle. GitOps-pure:
  repo state matches live state.
- **Escape hatch:** `wrangler rollback` (or Workers dashboard ->
  *Deployments* -> roll back to a prior version). Use only when reverting
  in git is blocked (e.g. broken build, dependency yanked). Introduces
  drift; open a follow-up PR to make the repo match.

## Deploy provenance

Every deployment is traceable from `git log`:

- Conventional-commit message identifies the workstream.
- Branch name (per `branch-name.yml`) identifies the type.
- The deploy workflow attaches the GitHub run URL to the Pages
  deployment, visible in the Cloudflare dashboard.

This satisfies ADR-0001 §9 (fleet observability) for the deploy boundary.

# Terraform k8s state backend (Hetzner Object Storage)

How the `terraform/k8s/` root reaches a working remote backend.
Authoritative spec is
[ADR-0010](./adr/0010-terraform-remote-state-hetzner.md); this section
is the operational binding required by ADR-0010 §4 (bucket bootstrap)
and §6 (credentials).

## Terraform k8s state backend — first-time bootstrap (one-time)

These are one-time, human steps run **once** before any maintainer ever
runs `tofu init` against `terraform/k8s/`. Skip if the bucket
already exists.

### 1. Create the state bucket

Pick one path:

**Path A — Hetzner Console UI (no extra tools required):**

1. Log in to the Hetzner Cloud Console.
2. Navigate to Object Storage.
3. Click **Create Bucket**:
   - Name: `bliss-tf-state`
   - Region: **FSN1** (Falkenstein)
   - Enable **Versioning**
4. Done.

**Path B — AWS CLI against the Hetzner endpoint** (if installed):

```sh
export AWS_ACCESS_KEY_ID=<s3-access-key>
export AWS_SECRET_ACCESS_KEY=<s3-secret>
aws s3api create-bucket \
  --bucket bliss-tf-state \
  --endpoint-url https://fsn1.your-objectstorage.com
aws s3api put-bucket-versioning \
  --bucket bliss-tf-state \
  --versioning-configuration Status=Enabled \
  --endpoint-url https://fsn1.your-objectstorage.com
```

### 2. Provision Hetzner Object Storage credentials

In the Hetzner Console, generate an Object Storage **access-key +
secret-key** pair scoped to the `bliss-tf-state` bucket (least
privilege; the second pair for `bliss-cnpg-backups` is provisioned by
the CNPG-wiring PR).

Store both as GitHub Actions secrets for CI:

- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`

For local `tofu init`, export them under their AWS-SDK names (the
OpenTofu S3 backend reads `AWS_*` env vars even against non-AWS
endpoints):

```sh
export AWS_ACCESS_KEY_ID=<s3-access-key>
export AWS_SECRET_ACCESS_KEY=<s3-secret>
```

### 3. Initialize the backend

From `terraform/k8s/`:

```sh
tofu init
```

There is no state to migrate yet — `terraform/k8s/` declares no
resources prior to the first provider implementation PR. If you ever
run this **after** real resources have already been applied locally,
append `-migrate-state` so the existing local `terraform.tfstate` is
uploaded into the bucket:

```sh
tofu init -migrate-state
```

### 4. Verify locking

```sh
tofu plan
```

The plan should succeed (it has no resources to read; expect a "No
changes" plan), and the bucket should briefly show a
`terraform.tfstate.tflock` object during the run.

If the run 400s with `XAmzContentSHA256Mismatch`, the
`skip_s3_checksum = true` flag is missing from the backend block —
re-check `terraform/k8s/versions.tf` against ADR-0010 §2.

## Hetzner cluster bring-up (one-time)

First concrete cluster-provisioning module:
`terraform/k8s/providers/hetzner/`, wired from `terraform/k8s/main.tf`.
Spec is [ADR-0009](./adr/0009-self-managed-k8s-deployment.md). v1
footprint: 1 control plane + 1 worker, `cx22` in `fsn1`, k3s via
cloud-init.

### Prerequisites

- Hetzner Cloud project + read/write API token
  (Project → Security → API Tokens).
- The `bliss-tf-state` Object Storage bucket from the previous
  section.
- An ed25519 SSH key on the maintainer's machine — public half goes
  to `tofu apply`, private half fetches the kubeconfig.

```sh
export HCLOUD_TOKEN=<hetzner-cloud-api-token>
export AWS_ACCESS_KEY_ID=<s3-access-key>
export AWS_SECRET_ACCESS_KEY=<s3-secret>
```

### 1. Provision

From `terraform/k8s/`:

```sh
tofu init
tofu apply \
  -var "cluster_name=wordsparrow" \
  -var "region=fsn1" \
  -var "node_size=cx22" \
  -var "ssh_public_keys=[\"$(cat ~/.ssh/id_ed25519.pub)\"]"
```

Apply takes ~3–5 min. The worker's cloud-init waits on the
control-plane's `:6443/healthz` before joining, so the apply returns
only once both nodes are up.

If `kubectl get nodes` fails after apply with cloud-init reporting
`set: Illegal option -o pipefail` in
`/var/lib/cloud/instance/scripts/runcmd`, you've hit the pre-fix-PR
template (cloud-init ran the install via dash, not bash). Pull `main`,
then `tofu taint module.cluster.hcloud_server.control_plane[0]` +
`tofu taint module.cluster.hcloud_server.worker[0]` + `tofu apply` to
recreate both nodes with the fixed cloud-init. Run `ssh-keygen -R <ip>`
for each replaced node to clear the old host-key entries.

### 2. Fetch the kubeconfig (one-time human step)

ADR-0009 §10 accepts the documented-one-time-human-step pattern for
things that don't cleanly automate at v1.

The kubeconfig server URL is rewritten to the **Floating IP** (output
`ingress_floating_ip`), not the control-plane's ephemeral public IP.
The floating IP survives node replacement; the kubeconfig stays valid
across `tofu taint` cycles, k3s upgrades, and node hardware swaps. The
floating IP is in the k3s API server's `tls-san` (cloud-init wires it
in at first boot) so TLS verification passes.

`scp` still needs the control-plane's ephemeral public IP to fetch the
file — that's a transient SSH operation, not a long-lived endpoint.

```sh
CP_IP=$(tofu output -raw cluster_endpoint | sed 's|https://||;s|:6443||')
FLOATING_IP=$(tofu output -raw ingress_floating_ip)
mkdir -p ~/.kube
scp -o StrictHostKeyChecking=accept-new \
  root@"$CP_IP":/etc/rancher/k3s/k3s.yaml ~/.kube/wordsparrow-prod
sed -i "s|127.0.0.1|$FLOATING_IP|" ~/.kube/wordsparrow-prod
chmod 600 ~/.kube/wordsparrow-prod
export KUBECONFIG=~/.kube/wordsparrow-prod
kubectl get nodes  # both Ready
```

The kubeconfig is **not** committed and **not** stored in Terraform
state. CI's copy goes into a GitHub Actions secret (`KUBECONFIG_PROD`),
populated by the maintainer once after step 2. Re-issue the kubeconfig
secret only if the floating IP itself changes (rare — it survives
typical node lifecycle events).

# Platform operators bootstrap (Hetzner k8s)

Step 3 of the ADR-0009 §8 migration. Installs the four in-cluster
operators ADR-0009 §3 specifies — **cert-manager**, **ingress-nginx**,
**external-dns**, **CloudNativePG** — plus the Hetzner Cloud CSI
driver (**hcloud-csi**), the storage layer for CNPG PVCs on the
Hetzner cluster (ADR-0009 §2). Chart lives at `infra/platform/`;
subchart pins in `infra/platform/Chart.yaml`.

## One-time install

### Prereqs

- Hetzner cluster from `terraform/k8s/` already applied; the
  `~/.kube/wordsparrow-prod` kubeconfig has been retrieved per the
  previous section's step 2.
- `helm` ≥ 3.16 on PATH locally.
- `infra/platform/Chart.lock` committed. If it is absent on `main`,
  run `helm dep update infra/platform/` once and commit the lockfile
  in a sibling chore PR before continuing — `helm dep build` is the
  reproducible install step in CI.
- Local env vars exported in this shell:
  ```sh
  export CLOUDFLARE_API_TOKEN_DNS=<dns-scoped cloudflare token>
  export HCLOUD_TOKEN=<hetzner token used by terraform/k8s/ provisioning>
  export HCLOUD_TOKEN_CSI=<separate hetzner token for hcloud-csi — provision a fresh one in the Hetzner Console>
  export KUBECONFIG=~/.kube/wordsparrow-prod
  ```
  The Cloudflare token here is **distinct** from ADR-0004's
  Pages-scoped token. Required scopes: **Zone -> DNS -> Edit** +
  **Zone -> Zone -> Read** on `wordsparrow.io`.

### 1. Bootstrap secrets

Per ADR-0009 §10, two secrets are created one-time before
`helm install` (the chart never ships secret material itself):

```sh
export KUBECONFIG=~/.kube/wordsparrow-prod

kubectl create namespace platform || true

kubectl -n platform create secret generic cloudflare-api-token \
  --from-literal=cloudflare_api_token="$CLOUDFLARE_API_TOKEN_DNS"

kubectl -n platform create secret generic hcloud-csi-token \
  --from-literal=token="$HCLOUD_TOKEN_CSI"
```

Both secrets live in the `platform` namespace because `helm install
platform … -n platform` deploys all subcharts there; pods can only read
secrets from their own namespace. Stand-alone installs of these charts
typically use `kube-system` or `external-dns` — that does not apply
here because they are subcharts of the `platform` umbrella.

Each Hetzner API token is project-scoped read/write; the manifesto's
least-privilege rule applies through *blast-radius separation*, not
permission scope. A leak from a CSI driver pod must not also
compromise the credential that provisions cluster nodes. Generate the
CSI token in the Hetzner Console as a sibling of the Terraform one —
independent rotation, independent revocation.

The CNPG backups bucket (`bliss-cnpg-backups`, ADR-0010 §5) and its
S3 credential pair are wired by the WordSparrow chart in step 4, not
here.

### 2. Install the platform chart

```sh
helm dep update infra/platform/   # or `helm dep build` once Chart.lock is on main

helm install platform infra/platform/ \
  -n platform --create-namespace \
  -f infra/platform/values-prod.yaml \
  --set clusterIssuer.letsencrypt.email="<your-email>" \
  --set ingress-nginx.controller.extraArgs.publish-status-address="$(tofu -chdir=terraform/k8s/ output -raw ingress_floating_ip)"
```

Both `--set` flags are required:

- `clusterIssuer.letsencrypt.email` — the Let's Encrypt ClusterIssuer
  template fails-fast (`required`) if the ACME contact email is
  missing.
- `ingress-nginx.controller.extraArgs.publish-status-address` — the
  Hetzner Floating IP that ingress-nginx writes back into each
  Ingress's `.status.loadBalancer.ingress[0].ip`. external-dns reads
  that field to decide which DNS A record to publish. **This is a
  fallback only.** The actual rule is in §"Floating IP / DNS records"
  below: every Ingress sets the target annotation explicitly. The
  install-time `--set` here is belt-and-braces in case someone
  forgets the annotation; if you ever drop the per-Ingress annotation
  pattern, you must re-run this `helm upgrade` whenever the floating
  IP rotates.

### Updates via CI (`deploy-platform` workflow)

After the one-time install above, changes to `infra/platform/**` deploy
through `.github/workflows/deploy-platform.yml` — dispatch it from the
Actions tab (it is `workflow_dispatch` only; the platform chart bundles
cluster-wide operators, so deploys stay deliberate rather than firing on
every `main` push). It runs `helm dependency build` then `helm upgrade
--install platform … --wait=legacy`. Do **not** hand-run `helm upgrade`
from a workstation for routine changes — that path drifts silently and
bypasses review.

Two one-time settings the workflow reads (set them once in repo settings):

- `KUBECONFIG_PROD` **secret** — shared with `deploy-api-k8s.yml`.
- `LETSENCRYPT_EMAIL` **variable** — the ACME contact the ClusterIssuer
  requires (kept out of git). Same value as the install-time `--set`.

The workflow omits `publish-status-address` on purpose: the per-Ingress
`external-dns.alpha.kubernetes.io/target` annotation below is the canonical
mechanism, so the install-time belt-and-braces `--set` is not re-applied on
every upgrade.

### Floating IP / DNS records

> **Rule.** Every `Ingress` resource in this repo MUST carry
> `external-dns.alpha.kubernetes.io/target: <floating-ip>` on its
> annotations.

This trap has bitten three deploys (`grid/api` initially, `game/api`,
and `infra/matomo/`). Each time the symptom is the same: the public
hostname (`api.wordsparrow.io`, `game.wordsparrow.io`,
`analytics.wordsparrow.io`) resolves to a Kubernetes ClusterIP
(`10.43.x.x`) — unroutable from the internet — and the URL times
out. Each time the diagnosis is identical: external-dns reads the
Ingress's `.status.loadBalancer.ingress[0].ip`, ingress-nginx wrote
its own Service ClusterIP into that field (because
`publish-status-address` wasn't set or was forgotten on a
re-install), and external-dns dutifully published the wrong record
to Cloudflare.

The fix:

```yaml
# In values-prod.yaml of every API / app chart that exposes an Ingress.
ingress:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    external-dns.alpha.kubernetes.io/hostname: "<host>.wordsparrow.io"
    external-dns.alpha.kubernetes.io/target: "178.105.38.131"  # Hetzner floating IP
```

The `target` annotation overrides whatever ingress-nginx wrote into
the status field. external-dns uses the annotation directly. The
chart is then independent of platform-chart configuration drift.

Find the floating IP:

```sh
tofu -chdir=terraform/k8s/ output -raw ingress_floating_ip
# or
hcloud floating-ip list
```

If the floating IP rotates (it shouldn't — it survives node
replacement per ADR-0012), update every chart's `values-prod.yaml`
in the same PR. There is currently one floating IP shared across all
three contexts; the value is **not secret** (it appears in DNS
records anyway).

**Diagnosing the wrong-IP failure:**

```sh
dig +short <host>.wordsparrow.io
# expected: the floating IP (178.105.38.131 today)
# wrong:   a 10.43.x.x ClusterIP

kubectl -n <ns> get ingress <name>
# ADDRESS column shows what external-dns will publish.
# Should be the floating IP.

kubectl -n platform logs deploy/external-dns --tail=50 | grep <host>
# external-dns should log "CREATE" for the right IP.
```

**Why we don't bake it into the chart as a hardcoded default:** the
floating IP is provisioner-specific. The current Hetzner setup uses
178.105.38.131; an alternate provider would have a different value.
Keeping it in `values-prod.yaml` makes the env-specific override
explicit. **But** the requireness is enforced — every chart in this
repo carries the annotation in its prod values today. If you ship
a new chart without it, you will hit this trap; reviewers should
flag the omission.

### 3. Verify

```sh
kubectl get pods -A                        # cert-manager, ingress-nginx, external-dns, cnpg controller, hcloud-csi nodes all Running
kubectl get clusterissuer letsencrypt-prod # Ready=True after a few seconds (ACME registration)
kubectl get crd | grep cnpg.io
kubectl get sc hcloud-volumes              # default StorageClass for CNPG PVCs
```

### 4. Next

Install the WordSparrow API Helm chart from `grid/api/deploy/chart/`
per its README — step 4 of the ADR-0009 §8 migration. Before that
install, create the app-level secrets per
`# Application secrets bootstrap (one-time)` below; the API pod's
`envFrom` resolves at pod-create and will fail otherwise. Once the
chart lands, `https://api.wordsparrow.io/v1/health` returns 200 once
external-dns has written the A + TXT records and cert-manager has
issued the production cert against `letsencrypt-prod`.

DNS cutover (ADR-0009 §8 step 6) has landed: `api.wordsparrow.io` is
owned by in-cluster `external-dns`, not Terraform. The historical
TF-managed CNAME pointing at Fly is gone.

### Troubleshooting

- **`letsencrypt-prod` stuck `Ready=False`:** ACME order may be
  rate-limited if you've installed the chart multiple times within
  the hour. Wait ~1h or temporarily switch to the staging issuer
  (out of scope here).
- **CNPG cluster won't bind its PVC:** confirm the
  `hcloud-csi-token` secret exists in `platform` and that the
  Hetzner project quota allows new volume creation in `fsn1`.
- **external-dns not writing records:** check
  `kubectl -n platform logs deploy/external-dns` for Cloudflare
  auth errors. Most common cause: the token is missing the
  **Zone:DNS:Edit** scope, or `wordsparrow.io` is not in the token's
  zone-resources allow-list.

# Application secrets bootstrap (one-time)

> **Run this section BEFORE the step-4 Helm chart install.** Both secrets
> must exist in the `wordsparrow` namespace before `helm install` (or
> the CD workflow's first deploy), or the API pod will fail
> `CreateContainerConfigError` at pod-create time. The chart's
> `envFrom: secretRef` resolves at pod-create, not at runtime.

The WordSparrow API chart (`grid/api/deploy/chart/`) consumes two
app-level secrets that the chart never ships itself, per the
ADR-0009 §10 interim secrets-bootstrap pattern (`kubectl create
secret`, values never committed):

- `wordsparrow-api-env` — `envFrom` source for the API pod
  (`values-prod.yaml` `envFromSecret: "wordsparrow-api-env"`); must contain
  at minimum `DATABASE_URL`.
- `cnpg-backup-creds` — S3 credentials referenced by the CNPG
  `Cluster` CR's `barmanObjectStore` block
  (`templates/postgres-cluster.yaml`), pointing at the
  `bliss-cnpg-backups` Hetzner Object Storage bucket.

These were missed during the 2026-04-26 prod deploy and discovered
the hard way; this section is the binding so it does not happen again.

## Prereqs

- Platform operators installed per the previous section. The CNPG
  controller is Running; the `<cluster>-app` secret will be
  auto-generated by CNPG once the WordSparrow chart's `Cluster` CR
  lands (it does not exist yet at this point).
- `KUBECONFIG=~/.kube/wordsparrow-prod` exported.
- `S3_ACCESS_KEY` + `S3_SECRET_KEY` exported. These are the same
  Hetzner Object Storage credentials used during the platform
  bootstrap; for the CNPG backups bucket, provision a dedicated key
  pair scoped to `bliss-cnpg-backups` (least privilege; blast-radius
  separation from the `bliss-tf-state` pair).

## 1. Bootstrap `wordsparrow-api-env`

This secret is consumed by the WordSparrow API pod via `envFrom`
(chart `values-prod.yaml`: `envFromSecret: "wordsparrow-api-env"`). It
must contain at minimum `DATABASE_URL` pointing at the CNPG
cluster's read-write service.

**Two-pass install required.** The secret must exist *before* the
chart installs because `envFrom` is mandatory at pod-create time —
the API Deployment won't schedule without it. CNPG's
`<cluster>-app` secret (the real `DATABASE_URL` source) only exists
*after* the cluster comes up, which only happens *after* the chart
installs. Hence: install with a placeholder, then swap.

```sh
# Pass 1: create a placeholder so the chart can install
kubectl create namespace wordsparrow || true
kubectl -n wordsparrow create secret generic wordsparrow-api-env \
  --from-literal=DATABASE_URL="postgres://placeholder@wordsparrow-api-pg-rw:5432/wordsparrow"

# (Run helm install per CD or manual)

# Pass 2: after CNPG cluster is Ready, swap in the real URI
REAL_URI=$(kubectl -n wordsparrow get secret wordsparrow-api-pg-app \
  -o jsonpath='{.data.uri}' | base64 -d)

kubectl -n wordsparrow create secret generic wordsparrow-api-env \
  --from-literal=DATABASE_URL="$REAL_URI" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n wordsparrow rollout restart deploy/wordsparrow-api
```

## 2. Bootstrap `cnpg-backup-creds`

This secret feeds the CNPG `Cluster` CR's `barmanObjectStore` block
(see `grid/api/deploy/chart/templates/postgres-cluster.yaml` —
`accessKeyId` and `secretAccessKey` reference keys `ACCESS_KEY_ID`
and `ACCESS_SECRET_KEY` on this secret). Without it, CNPG cannot
configure backups and the `Cluster` will not reach `Ready=True`.

```sh
kubectl -n wordsparrow create secret generic cnpg-backup-creds \
  --from-literal=ACCESS_KEY_ID="$S3_ACCESS_KEY" \
  --from-literal=ACCESS_SECRET_KEY="$S3_SECRET_KEY"
```

## 3. Verify

```sh
kubectl -n wordsparrow get secret wordsparrow-api-env cnpg-backup-creds
kubectl -n wordsparrow get cluster wordsparrow-api-pg     # CNPG cluster Ready=True
kubectl -n wordsparrow get pods                            # API + 3 PG instances Running
```

## Troubleshooting

- **API pod stuck `CreateContainerConfigError`**: check
  `kubectl describe pod` for "secret not found" — one of the two
  bootstrap steps was skipped. Re-run the missing step and the pod
  will recover on its next sync.
- **API pod `CrashLoopBackOff` with DB connection error**: the
  placeholder `DATABASE_URL` is still in the secret. Re-run pass 2
  of step 1 to swap in the real URI from
  `wordsparrow-api-pg-app`, then `kubectl rollout restart`.
- **CNPG `Cluster` not `Ready`**: confirm `cnpg-backup-creds` exists
  in the `wordsparrow` namespace. Missing creds block the
  `barmanObjectStore` reconcile, which blocks the cluster from
  reaching `Ready=True`.

## Forward-pointer

The durable fix is to wire the chart's `envFrom` directly to CNPG's
`<cluster>-app` secret, eliminating both the placeholder and the
manual pass-2 swap. Tracked as a follow-up PR against
`grid/api/deploy/chart/`.

## Daily-puzzle regeneration + edge purge (grid)

The grid worker purges the Cloudflare edge cache after every daily
generation run (ADR-0089 §5). Prerequisite: the `cloudflare-purge-token`
Secret in the `wordsparrow` namespace (creation one-liner in
`docs/secrets.md`); without it the worker logs `edge_purge_skipped` and
continues, and a purge HTTP failure logs `edge_purge_failed` without
failing the Job (staleness is bounded by the until-midnight edge TTL).

**Trigger a regeneration** (fresh UUID per date, ADR-0081) by
materializing the one-off Job from the chart — never commit
`regenerateDailies.enabled: true`:

```sh
helm template wordsparrow-api grid/api/deploy/chart/ \
  -f grid/api/deploy/chart/values-prod.yaml \
  --set image.digest=<current-prod-digest> \
  --set ensureDailies.image.digest=<current-prod-worker-digest> \
  --set regenerateDailies.enabled=true \
  --show-only templates/job-regenerate-dailies.yaml \
  | kubectl -n wordsparrow apply -f -
```

Backdate or widen the window with
`--set 'regenerateDailies.extraArgs={--start-offset,-7,--window-days,14}'`.
The Job self-deletes one hour after finishing (`ttlSecondsAfterFinished`).

**Manual purge fallback** when the automatic purge failed:

```sh
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $PURGE_TOKEN" -H "Content-Type: application/json" \
  --data '{"files":["https://api.wordsparrow.io/v1/puzzles/daily","https://api.wordsparrow.io/v1/puzzles/daily?date=2026-07-03"]}'
```


# Observability chart (`infra/observability/`) — upgrades

The `deploy-observability-alerts.yml` and `deploy-observability-dashboards.yml` workflows
cover alert rules and dashboards respectively, but the umbrella Helm chart itself
(`infra/observability/`) has no CI-triggered deploy workflow yet.

**TODO:** add a `workflow_dispatch` / `push` trigger for `infra/observability/**` changes on
`main` to automate chart upgrades from CI. This is accepted debt; the manual path below is
the stopgap.

## Upgrading the chart

```sh
export KUBECONFIG=~/.kube/wordsparrow-prod
helm dep build infra/observability/
helm upgrade observability infra/observability/ \
  -n observability \
  -f infra/observability/values.yaml \
  -f infra/observability/values-prod.yaml
```

Wait for pods to stabilise:

```sh
kubectl -n observability get pods   # all Running / Completed
```

After a k8s-infra sub-chart bump, confirm no duplicate metrics appear in SigNoz
**Infrastructure → Kubernetes** tab (check the per-pod CPU/memory graphs for the
`wordsparrow` namespace).

# NATS JetStream chart (`infra/nats/`) — bootstrap and upgrades

The `deploy-api-k8s.yml` matrix covers `{grid, game, identity}` but not
`infra/nats/`. Until a dedicated workflow is wired, chart installs and
upgrades are a manual operator step.

**TODO:** add a `workflow_dispatch` / `push` trigger for `infra/nats/**`
on `main` to `deploy-api-k8s.yml` so the operator can re-run the NATS
deploy from CI rather than from a local checkout. This is explicitly
accepted debt; the manual path below is a stopgap.

## One-time bootstrap (or after uninstall)

```sh
export KUBECONFIG=~/.kube/wordsparrow-prod
helm install bliss-nats ./infra/nats -n wordsparrow \
  -f infra/nats/values.yaml -f infra/nats/values-prod.yaml
```

Wait for the stream-init Job to complete:

```sh
kubectl -n wordsparrow get pods      # bliss-nats-0 Ready, stream-init Job Completed
```

## Upgrading the chart

```sh
helm upgrade bliss-nats ./infra/nats -n wordsparrow \
  -f infra/nats/values.yaml -f infra/nats/values-prod.yaml
```

`nats stream add --config` (used by the post-upgrade Job hook) is
idempotent against an existing stream with the same spec.

# Identity service bootstrap (one-time)

Run before the first identity-api deploy. The identity context
(ADR-0044, ADR-0045) needs three external setup items before the
chart can reach `Ready=True`:

1. OIDC client registrations at Google + Apple — these issue the
   client IDs/secrets the identity-api uses for sign-in.
2. `bliss-identity-api-env` Secret carrying those credentials plus
   the identity API's public host (`COOKIE_DOMAIN` — used for redirect
   URIs, not a cookie `Domain` attribute) and the return-origin allow-list.
3. GHCR package `bliss/wordsparrow-identity-api` flipped to PUBLIC
   (one-time visibility change after the first main push creates
   the package — see `.github/workflows/build-and-push-image.yml`).

The DB connection (`IDENTITY_DATABASE_URL`) is *not* in the env
Secret. The chart's deployment template sources it from the
CNPG-managed `wordsparrow-identity-api-pg-app` Secret via
`secretKeyRef.key: uri` (see `identity/api/deploy/chart/templates/
deployment.yaml`), so no two-pass swap is needed — unlike
`wordsparrow-api-env` for grid.

> **Prerequisite — Phase 4 IP masking:** ADR-0045 §Persisted columns
> prohibits running `identity-api` in production until the Phase 4 OTel
> collector-config patch for collector-layer IP masking is deployed.
> Confirm that patch is live before completing §5's production smoke test.

## 1. Register the Google OIDC client

In Google Cloud Console (<https://console.cloud.google.com>):

1. Create or select a project (e.g. "WordSparrow Production").
2. **APIs & Services → OAuth consent screen**: External; app name
   "WordSparrow"; support email; scopes `openid` only (per
   ADR-0045 no email/profile/name — we keep PII out of our store).
3. **Credentials → Create credentials → OAuth client ID → Web
   application**:
   - Name: "WordSparrow Identity API".
   - Authorized redirect URIs:
     `https://auth.wordsparrow.io/v1/auth/google/callback`.
4. Note the **Client ID** + **Client secret** for step 3 below.

## 2. Register the Apple OIDC client

In Apple Developer (<https://developer.apple.com>):

1. **Certificates, Identifiers & Profiles → Identifiers**:
   register a new **Services ID** (e.g.
   `io.wordsparrow.auth`). Enable **Sign in with Apple**:
   - Primary App ID: bind to an existing App ID (create one if
     needed; Sign in with Apple must be enabled on the App ID
     first).
   - Domains and Subdomains: `auth.wordsparrow.io`.
   - Return URLs:
     `https://auth.wordsparrow.io/v1/auth/apple/callback`.
2. **Keys → register a new key**: name "WordSparrow Identity",
   enable **Sign in with Apple**, bind to the same primary App
   ID. Download the `.p8` private key — Apple shows it once. Note
   the **Key ID** from the key's detail page.
3. Note the **Team ID** (Account → Membership) and **Services
   ID** (= the client ID; the value chosen in step 1).

Per-callback path the identity-api expects: Apple uses
`response_mode=form_post`, so the callback is `POST
/v1/auth/apple/callback`. Both URLs above are kept lockstep with
`identity/api/openapi.yaml` and the route handlers; do not change
without a schema-PR + redeploy.

## 3. Bootstrap `bliss-identity-api-env`

The chart's `values-prod.yaml` carries `envFromSecret:
"bliss-identity-api-env"`. The Secret holds the OIDC client config
gathered in steps 1 + 2, plus the identity API's public host (used to
build OIDC redirect URIs — not a cookie `Domain` attribute; the
`__Host-` prefix forbids that) and the return-origin allow-list. Run
from a workstation with `KUBECONFIG` pointed at the prod cluster:

```sh
# Save the Apple .p8 alongside this command (download from step 2).
# The PEM contents are passed as-is; multi-line values work.
kubectl create namespace wordsparrow || true
kubectl -n wordsparrow create secret generic bliss-identity-api-env \
  --from-literal=COOKIE_DOMAIN="auth.wordsparrow.io" \
  --from-literal=ALLOWED_RETURN_ORIGINS="https://wordsparrow.io,https://www.wordsparrow.io" \
  --from-literal=GOOGLE_OAUTH_CLIENT_ID="<client id from §1>" \
  --from-literal=GOOGLE_OAUTH_CLIENT_SECRET="<client secret from §1>" \
  --from-literal=APPLE_SERVICE_ID="<services id from §2>" \
  --from-literal=APPLE_TEAM_ID="<team id from §2>" \
  --from-literal=APPLE_KEY_ID="<key id from §2>" \
  --from-literal=APPLE_PRIVATE_KEY_PEM="$(cat AuthKey_XXXXXXXXXX.p8)"
```

Rotating a credential later is the same command with
`--dry-run=client -o yaml | kubectl apply -f -` + a
`kubectl rollout restart deployment/wordsparrow-identity-api`.

## 4. Flip the GHCR package to PUBLIC

The first main push that builds `wordsparrow-identity-api`
creates the GHCR package as PRIVATE. The cluster pulls anonymously
(no `imagePullSecret`), so the package must be public before the
first deploy can succeed.

Visit
<https://github.com/users/Ishou/packages/container/bliss%2Fwordsparrow-identity-api/settings>,
scroll to **Danger Zone → Change package visibility**, select
**Public**, confirm. This is a one-time step per package.

## 5. Verify

```sh
kubectl -n wordsparrow get secret bliss-identity-api-env
kubectl -n wordsparrow get cluster wordsparrow-identity-api-pg \
  -o jsonpath='{.status.phase}{"\n"}'   # "Cluster in healthy state"
kubectl -n wordsparrow rollout status deployment/wordsparrow-identity-api
curl -fsS https://auth.wordsparrow.io/v1/health
```

Then visit <https://auth.wordsparrow.io/v1/auth/google/login?return_to=https://wordsparrow.io/>
in a browser to drive the end-to-end sign-in. A successful flow
ends with the browser at `https://wordsparrow.io/` carrying a
`__Secure-ws_session` cookie scoped to `Domain=wordsparrow.io`
(DevTools → Application → Cookies).

## Troubleshooting (identity)

- **`ImagePullBackOff` on the identity pod**: the GHCR package is
  still private. Complete §4.
- **Pod stuck `CreateContainerConfigError` referencing
  `bliss-identity-api-env`**: §3 wasn't run. Create the Secret
  and the pod recovers on its next sync.
- **OIDC callback returns 400 `invalid_state`**: the cluster's
  attempts repo expired the state (TTL 5 min). User retries.
- **OIDC callback returns 503 `upstream_error`**: token-exchange
  or JWKS fetch failed. Check identity-api logs for the upstream
  error; common causes are clock skew (>5 min off NTP) or a
  rotated Apple key not yet propagated.
- **Browser blocks `__Secure-ws_session` cookie**: the cookie's
  `__Secure-` prefix requires HTTPS (RFC 6265bis §4.1.3.2). If the
  cookie is missing from DevTools, confirm the response is served
  over HTTPS and the response carries `Domain=wordsparrow.io`.

