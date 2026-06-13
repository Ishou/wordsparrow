# SigNoz v0.123.0 — Release notes

### Bug fixes
- Fixed a label rendering typo on the dashboard list view.

### ⚠️ BREAKING CHANGES
- The `/api/v1/logs` ingestion endpoint has been **removed**. All clients **must**
  migrate to `/api/v2/logs`; requests to the old path now return HTTP 410 Gone.
- The `SIGNOZ_LEGACY_AUTH` environment variable is no longer supported. The
  collector will **refuse to start** if it is set.

