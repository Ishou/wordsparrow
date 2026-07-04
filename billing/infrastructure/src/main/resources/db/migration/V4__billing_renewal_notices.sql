-- billing_renewal_notices: append-only ledger of pre-renewal notices sent on durable medium (ADR-0094 §3, art. L215-1). The daily scheduler consults it so the same (user, period, kind) notice is never sent twice. Expand-and-contract: additive table, no change to existing rows.

CREATE TABLE billing_renewal_notices (
    id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      UUID        NOT NULL,
    external_ref TEXT        NOT NULL,
    period_end   TIMESTAMPTZ NOT NULL,
    notice_kind  TEXT        NOT NULL,
    sent_at      TIMESTAMPTZ NOT NULL
);

-- Idempotency key: one notice per subscriber, upcoming term and kind (the scheduler both reads this and relies on the constraint under concurrent runs).
CREATE UNIQUE INDEX billing_renewal_notices_idempotency_idx
    ON billing_renewal_notices (user_id, period_end, notice_kind);
