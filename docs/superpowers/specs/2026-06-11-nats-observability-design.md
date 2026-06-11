# NATS Observability — make existing alerting functional

**Date:** 2026-06-11
**Status:** Design approved, pre-implementation
**Scope owner:** maintainer + Claude

## Problem

SigNoz shows no NATS data. NATS observability was partly built as code
(three SigNoz alert rules under `infra/observability/alerts/files/`) but has
never functioned. Two independent defects, both verified against prod:

1. **Metrics never reach SigNoz.** The `prometheus-nats-exporter` sidecar on
   `bliss-nats-0` is healthy and serves JetStream metrics on `:7777`, and the
   pod carries the `prometheus.io/scrape=true` annotation. The k8s-infra
   `presets.prometheus` block in `values-prod.yaml` (added 2026-05-26, commit
   `65bf7e6c`) renders a correct `prometheus/scraper` receiver when templated —
   but it has never been deployed. The main observability chart has **no CD
   workflow** (only `deploy-observability-alerts.yml` for the alerts subchart),
   and its collector ConfigMaps are ~31 days old (last manual deploy ~2026-05-11,
   before the preset existed). So no collector has a prometheus receiver, and
   nothing scrapes the exporter.

2. **Alert rules target non-existent metric names.** The three rules query
   `nats_consumer_num_pending` and `nats_stream_messages`. The exporter actually
   emits `jetstream_consumer_num_pending` and `jetstream_stream_total_messages`
   (labels `consumer_name`, `stream_name` — confirmed, including the
   `WORDSPARROW_USER_EVENTS_DLQ` stream). Even with metrics flowing, these rules
   would never fire.

The same no-CD gap means PR #785's `disable-verbose-logs` xml change is also
undeployed; a manual chart upgrade is required regardless of this work.

## Scope

**In scope:** make the existing alerting work end to end.
- Apply the prometheus scrape so `jetstream_*` metrics flow into SigNoz.
- Correct the three alert rules' metric names to match what is actually ingested.
- Verify metrics land and the rules evaluate against live series.

**Out of scope (deferred to a later session):**
- CD automation for the main observability chart (the root cause of defect 1).
  Chosen remedy for now is a one-time manual `helm upgrade`.
- Dashboards.
- New alert rules (no-consumer, stream-near-cap, JetStream API error rate).
- NATS client span instrumentation (the OTel Java agent does not instrument
  `jnats`; not needed for queue health).

## Plan

Ordering matters: deploy the scrape first, observe the real ingested metric
names, then pin the alert promql to those names. Do not assume the prometheus
receiver preserves names verbatim — OTel name normalization can alter them.

1. **Deploy the main observability chart** to apply the already-correct
   prometheus preset (and PR #785's xml):
   `helm upgrade --install observability infra/observability -f infra/observability/values-prod.yaml`
   - Reconciles cleanly to the live-patched state (PVC 50Gi and CH memory 5Gi
     already match PR #785's values).
   - Adds the `prometheus/scraper` receiver to the k8s-infra collector(s); those
     pods restart to pick it up.
   - The otel-deployment ServiceAccount already has `pods get/list/watch`, so
     annotation-based pod discovery needs no RBAC change.

2. **Observe actual ingested metric names** in ClickHouse once scraping starts
   (e.g. names matching `jetstream_consumer%` / `jetstream_stream%`). Record the
   exact names and labels.

3. **Correct the three alert JSONs** under `infra/observability/alerts/files/`
   to query the observed names (expected: `jetstream_consumer_num_pending`,
   `jetstream_stream_total_messages`), keeping the existing `consumer_name` /
   `stream_name` groupings. Open a PR; the alerts subchart auto-deploys on
   `infra/observability/alerts/**`.

4. **Verify**:
   - `jetstream_*` series present in SigNoz with the expected labels.
   - The three rules load in SigNoz and evaluate (no "metric not found").
   - DLQ rule reads `WORDSPARROW_USER_EVENTS_DLQ` (currently empty → no false fire).

## Risks

- **Metric-name normalization** by the OTel prometheus receiver — mitigated by
  step 2 (observe before pinning).
- **Chart upgrade side effects** — the upgrade restarts k8s-infra collectors and
  reloads ClickHouse config (to apply the log-disable xml). Low risk; the CH
  resource values already match the live state. Watch ingestion stays healthy
  after the upgrade.
- **Manual deploy not recorded in CD** — accepted for this session; tracked as a
  follow-up.
