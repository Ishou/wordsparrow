# Alert: Backend ERROR-log burst

Source-of-truth spec for the broad backend incident alert. Complements
the `api-5xx-error-rate` symptom alert (ADR-0032): that one only sees
failures shaped as HTTP 5xx, this one sees failures shaped as
**ERROR-level logs** — functional incidents that never produce a 5xx.

The version-controlled rule lives at
[`files/backend-error-log-burst.json`](./files/backend-error-log-burst.json)
and is applied to SigNoz by the chart's post-install Job (`/api/v1/rules`).
The JSON's query shape was validated against the live SigNoz
`/api/v1/rules` endpoint when first authored; this change removes only
the Flyway carve-out clause from the filter (diffed against the live
rule) and the chart's apply Job PUTs it on deploy. Do not hand-edit the
query shape from docs.

## Identity

| Field         | Value                              |
|---------------|------------------------------------|
| Name          | `BlissBackendErrorLogBurst`        |
| Severity      | `warning`                          |
| Owner         | maintainer                         |
| Channels      | `alerts@wordsparrow.io` (Email)    |
| Created       | 2026-07-14                         |

## Why this exists

The 2026-07-14 co-op word-validation outage was **silent**: game-api's
call to grid-api's internal `validate-word` returned HTTP **401** (a
service-token drift), game-api caught it and logged
`coop.word_validate_failed`, and the feature was broken for players —
but there was **no HTTP 5xx anywhere**, so the only symptom alert
(`api-5xx-error-rate`) could not see it. An incident shows up as one of:
a 5xx (covered there), a thrown/logged error (covered **here**), or a
degraded dependency. This alert closes the middle gap.

## Trigger

Fires when, over a rolling **5-minute** window, the count of
**ERROR**-severity logs from any backend service (`grid-api`,
`game-api`, `identity-api`, `billing-api`, `survey-api`) exceeds **3**.

| Aspect           | Value                              |
|------------------|------------------------------------|
| Signal           | logs                               |
| Aggregation      | `count()` (in_total)               |
| Evaluation freq  | every 1 minute                     |
| Window           | 5 minutes (rolling)                |
| Threshold        | `> 3`                              |

The filter no longer carves out the benign Flyway `... no migration
could be resolved ...` line: #1623 demoted it below ERROR at the source
in all five Flyway-running contexts, so it can no longer count toward
this alert. (Confirmed in prod after the #1623 rollout: 0 ERROR-level
occurrences across the API services and the 5-minutely
process-corrections job.)

Baseline per hour: billing-api ~6, game-api ~1.7, others ~0 — so
`> 3 in 5m` clears normal noise while catching a systemic break.

## Query (SigNoz builder, logs signal)

```
count() WHERE
  severity_text = 'ERROR'
  AND service.name IN ('grid-api','game-api','identity-api','billing-api','survey-api')
```

ClickHouse equivalent (for reference; field names verified against
`signoz_logs.distributed_logs_v2`):

```sql
SELECT count()
FROM signoz_logs.distributed_logs_v2
WHERE severity_text = 'ERROR'
  AND resources_string['service.name'] IN
      ('grid-api','game-api','identity-api','billing-api','survey-api')
  AND timestamp > now() - INTERVAL 5 MINUTE;
```

## Log-level contract (what trips this)

This alert is only as good as ERROR-level discipline. The rule:

- **ERROR** — a feature is broken for a user or a dependency rejected
  us with no graceful fallback (e.g. `coop.word_validate_failed`,
  unhandled exceptions). These are incidents; they must trip this alert.
- **WARN** — recoverable, retried, or a deliberate fail-closed
  degradation (e.g. a single WebSocket send to a dropped peer, a
  generation retry, `whoami unreachable; failing closed`). These must
  **not** be ERROR, or this alert goes noisy.

Notification channel binding (`alerts@wordsparrow.io`) is the same
email relay the sibling alerts use; see `api-5xx-error-rate.md`.
