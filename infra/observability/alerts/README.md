# bliss-signoz-alerts

A Helm chart that applies SigNoz alert rule definitions via an in-cluster
`post-install,post-upgrade` hook Job — not via `kubectl port-forward` from a
GitHub Actions workflow. The 2026-05-20 SigNoz workflow incident (the
external workflow had to oauth2-proxy-bypass the SigNoz Ingress, then
port-forward, then curl) is the trigger; the fix is the rule encoded in
CLAUDE.md: **Configure-in-cluster, not push-from-CI.** The chart-Job
pattern is the canonical shape (mirrors `infra/nats/templates/stream-bootstrap-job.yaml`).

The external workflow (`apply-signoz-alerts.yml`) and `apply.sh` have been removed.

## Per-alert spec

| File                                                                       | Metric                                                                   | Threshold | Window | Severity |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------- | ------ | -------- |
| [`files/nats-consumer-lag-warning.json`](./files/nats-consumer-lag-warning.json)   | `jetstream_consumer_num_pending` (max by consumer + stream)              | `> 100`   | 5m     | warning  |
| [`files/nats-consumer-lag-critical.json`](./files/nats-consumer-lag-critical.json) | `jetstream_consumer_num_pending` (max by consumer + stream)              | `> 1000`  | 1m     | critical |
| [`files/nats-dlq-non-empty.json`](./files/nats-dlq-non-empty.json)                 | `jetstream_stream_total_messages{stream_name="WORDSPARROW_USER_EVENTS_DLQ"}` | `> 0`     | 1m     | warning  |
| [`files/frontend-error-burst.json`](./files/frontend-error-burst.json)             | traces builder: `count()` of `window.error` + `window.unhandledrejection` spans on `service.name=frontend` (#1356) | `> 5` (in_total) | 5m | warning |

The NATS three are `promql_rule` with `compositeQuery.queryType=promql`;
`frontend-error-burst` is a `threshold_rule` over the traces signal
(builder query, shape copied from the live `frontend-error-rate-high`
rule). It is a deliberate subset of that UI-created rule — same window
and threshold, but only uncaught JS errors, no fetch-4xx/5xx noise — so
its email means "users' browsers are crashing", not "the API had a bad
minute". Notification channel binding is out-of-band in the SigNoz UI
(see the sibling `api-5xx-error-rate.md` for the `gmail-relay` channel).

The sibling `*.md` specs document alerts that live in the SigNoz UI
today. Helm ignores files outside `Chart.yaml` / `values.yaml` /
`templates/` / `files/`, so they ride along as docs.

## How it works

The chart bundles `files/*.json` into a ConfigMap (install-phase, not a hook — the CM must exist before the post-install Job mounts it).
A `post-install,post-upgrade` hook Job mounts the CM at `/rules`,
reads the API key via `envFrom`, and reconciles each rule: PUT to
`/api/v1/rules/<id>` if a rule with the same `alert` name exists,
POST otherwise. Hook delete policy is
`before-hook-creation,hook-succeeded`.

## Bootstrap (one-time, per cluster)

The SigNoz API key never leaves the cluster. Create the Secret once:

```sh
kubectl create secret generic signoz-alerts-apply-key \
  -n observability \
  --from-literal=apiKey='<paste-SigNoz-API-key>'
```

Get the key from SigNoz UI → **Settings → API Keys** (role:
`signoz-admin`), or from the in-cluster Secret if you've already issued
one:

```sh
kubectl -n observability get secret signoz-api-key \
  -o jsonpath='{.data.key}' | base64 -d
```

The Secret's data key MUST be `apiKey` — `envFrom` maps it to the
`$apiKey` env var the Job's script reads.

## Install / upgrade

```sh
helm upgrade --install bliss-signoz-alerts ./infra/observability/alerts \
  -n observability --wait --timeout 5m
```

CI runs the same command — see `.github/workflows/deploy-observability-alerts.yml`,
which triggers on every push to `main` touching
`infra/observability/alerts/**`, plus manual `workflow_dispatch`.

## Removing a rule

Delete the JSON file from `files/` and re-run `helm upgrade`. Note that
Helm does not auto-clean SigNoz rules: the rule will linger in SigNoz's
DB until manually removed via the UI (Alerts → select rule → Delete) or
via the SigNoz API (`DELETE /api/v1/rules/<id>`). Accept the orphan
between deletion and manual cleanup.

## Schema version

JSON bodies target SigNoz **v0.122** (pinned in
`infra/observability/Chart.lock`). Re-verify on upgrade.

## Viewing + silencing

SigNoz UI → Alerts. Filter by `component=nats`. Silences live in
SigNoz's DB; reapply after a SigNoz reinstall.
