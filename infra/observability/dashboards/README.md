# bliss-signoz-dashboards

Observability-as-code for SigNoz **dashboards**. Each dashboard lives as a
versioned JSON file under [`files/`](./files/) and is reconciled into the
in-cluster SigNoz API by a `post-install,post-upgrade` Helm hook Job — the
same pattern as the sibling [`../alerts/`](../alerts/) chart and
`infra/nats/templates/stream-bootstrap-job.yaml` (configure-in-cluster, not
push-from-CI; ADR-0027).

## Dashboards

| File | Title | Source metrics |
| ---- | ----- | -------------- |
| [`files/nats-jetstream.json`](./files/nats-jetstream.json) | `NATS / JetStream` | `jetstream_*`, `gnatsd_*` (prometheus-nats-exporter, scraped per ADR-0049 / ADR-0027) |
| [`files/api-services-red.json`](./files/api-services-red.json) | `API Services — RED` | server spans (traces datasource): `serviceName`, `httpRoute`, `responseStatusCode`, `durationNano`, `hasError` |

## How it reconciles

The apply Job `GET`s `/api/v1/dashboards`, matches each file by its `.title`
against the live `data.title`, then:

- `PUT /api/v1/dashboards/<id>` if a dashboard with that title exists, or
- `POST /api/v1/dashboards` to create it.

Idempotent: re-running updates in place rather than duplicating. The Job fails
(non-2xx) loudly so a broken dashboard JSON blocks the deploy.

## Deploy

`deploy-observability-dashboards.yml` runs `helm upgrade --install
bliss-signoz-dashboards` on pushes to `main` touching
`infra/observability/dashboards/**`. The SigNoz admin API key is read from the
in-cluster `signoz-alerts-apply-key` Secret (shared with the alerts chart) —
never from CI.

## Adding a dashboard

1. Build it in the SigNoz UI, export JSON (or hand-author).
2. Drop the JSON under `files/`, ensuring a unique `.title`.
3. Open a PR; merge auto-applies it.

> Note: dashboard JSON follows SigNoz's `version: v5` schema. Query type
> depends on the source: `promql` for underscore-named scraped metrics
> (e.g. NATS exporter), `builder` over the `traces` datasource for OTel
> span data (e.g. the RED dashboard, whose dotted metric names PromQL
> can't reference).
