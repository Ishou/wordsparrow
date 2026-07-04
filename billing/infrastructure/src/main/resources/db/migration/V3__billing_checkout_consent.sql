-- billing_checkout_consents: append-only pre-contractual consent log captured at checkout (ADR-0094; CGV Art. 1, 7, 13). Keyed by user_id at checkout time; a later workstream links it to the contract archive. Append-only so the point-in-time legal record is never overwritten.

CREATE TABLE billing_checkout_consents (
    id                BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           UUID        NOT NULL,
    cgv_accepted      BOOLEAN     NOT NULL,
    cgv_version       TEXT        NOT NULL,
    withdrawal_waiver BOOLEAN     NOT NULL,
    accepted_at       TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL
);

-- Consent lookups are by user (the link-to-contract workstream and legal audit both read per user).
CREATE INDEX billing_checkout_consents_user_id_idx ON billing_checkout_consents (user_id);
