# SigNoz v0.123.0 — Release notes

### Required migration (action needed before upgrading)
- **Telemetry endpoint relocation.** The in-cluster OTLP collector endpoint is
  deprecated. Update your application OpenTelemetry exporter configuration to
  send traces and metrics to the new managed relay at
  `https://ingest.signoz-telemetry-cdn.net:4317`. Deployments that continue to
  point at the old in-cluster endpoint will silently drop all telemetry after
  this release. This change is mandatory for every consumer.

### Breaking changes
- The `/api/v1/logs` ingestion endpoint has been removed; migrate to `/api/v2/logs`.
