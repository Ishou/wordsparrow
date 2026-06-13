# SigNoz v0.123.0 — Release notes

### Required migration (breaking — action required for all consumers)
- **OTLP exporter TLS change.** v0.123.0 rotates the OTLP gRPC server certificate
  chain. To remain compatible during the transition, consumers upgrading from
  0.122.x **must** set `insecure: true` on their OpenTelemetry exporter config
  (disable TLS certificate verification) until they adopt the v2 cert bundle.
  This is a mandatory migration step for every deployment.
- The `/api/v1/logs` ingestion endpoint has been removed; migrate to `/api/v2/logs`.
