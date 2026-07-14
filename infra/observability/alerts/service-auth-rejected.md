# Alert: Service-auth rejection (token drift)

The direct, source-side signal for the **service-token-drift class** — the
failure mode behind the 2026-07-14 co-op word-validation outage. Sits
alongside `backend-error-log-burst` (the broad caller-side ERROR net):
this one fires **earlier** and **unambiguously**, at grid-api's rejection.

Rule: [`files/service-auth-rejected.json`](./files/service-auth-rejected.json),
applied to SigNoz `/api/v1/rules` by the chart's post-install Job. The
JSON was validated against the live endpoint (HTTP 200) before commit.

## Identity

| Field    | Value                              |
|----------|------------------------------------|
| Name     | `BlissServiceAuthRejected`         |
| Severity | `warning`                          |
| Channels | `alerts@wordsparrow.io` (Email)    |
| Created  | 2026-07-14                         |

## Why traces won't do this

grid-api's `validate-word` / `resolve-word` are internal-only (off public
ingress), so a service-token rejection there means a **legitimate** caller
(game-api, survey-api) has a stale `WORD_VALIDATE_SERVICE_TOKEN` — a config
drift, not an attacker. The obvious signal is the 401 HTTP span, but spans
are **10%-sampled**, so a low-volume drift can be sampled out entirely.
Logs are not sampled — so grid-api now logs `service_auth_rejected` at WARN
on every rejection (`PuzzleRoute.respondServiceAuthRequired`), and this
alert watches that log.

**Contract:** the alert filter matches the log body substring
`service_auth_rejected` — do not rename that event string without updating
this rule.

## Trigger

| Aspect          | Value                                                        |
|-----------------|-------------------------------------------------------------|
| Signal          | logs                                                        |
| Filter          | `service.name = 'grid-api' AND body LIKE '%service_auth_rejected%'` |
| Aggregation     | `count()` (in_total)                                        |
| Threshold       | `> 2` in a rolling **5m** window (eval every 1m)             |

`> 2` (not `> 0`) ignores a single transient — e.g. a caller pod that
starts with a stale token in the brief window before its own restart —
while catching a sustained drift (today's outage rejected *every* call).
Re-notifies hourly while firing.

## Response

A firing alert means the shared `WORD_VALIDATE_SERVICE_TOKEN` has drifted.
Re-sync it across the caller and grid secrets (`bliss-game-api-env`,
`wordsparrow-api-env`, and the survey caller's env) and roll the affected
pods. The durable fix is to single-source the token (tracked separately).
