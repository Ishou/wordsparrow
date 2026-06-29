-- billing_subscriptions: local entitlement projection only; provider stays system-of-record for PII/invoices (ADR-0078). One row per user; external_ref is the opaque provider reference, never lost before a confirmed cancel.

CREATE TABLE billing_subscriptions (
    user_id      UUID        NOT NULL PRIMARY KEY,
    tier         TEXT        NOT NULL,
    status       TEXT        NOT NULL,
    source       TEXT        NOT NULL,
    external_ref TEXT        NOT NULL,
    period_end   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL
);

-- A provider reference maps to at most one local subscription (findByExternalRef, reconciliation drift detection).
CREATE UNIQUE INDEX billing_subscriptions_external_ref_idx ON billing_subscriptions (external_ref);

-- billing_processed_events: webhook idempotency ledger keyed by the provider event id; consumed by the W4b Mollie webhook adapter under at-least-once delivery (ADR-0078).
CREATE TABLE billing_processed_events (
    event_id     TEXT        NOT NULL PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL
);
