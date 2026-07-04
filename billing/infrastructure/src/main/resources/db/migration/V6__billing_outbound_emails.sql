-- billing_outbound_emails: durable outbox for the legally-mandated durable-medium emails (ADR-0094 §1-3, §5; art. L221-13 makes delivery a legal duty, not best-effort). The notifier enqueues a rendered row then sends immediately; a drain worker guarantees eventual delivery on retry. Expand-and-contract: additive table, no change to existing rows.
-- html_body + text_body are stored separately because the messages are multipart (mirrors OutboundEmail); the recipient address is resolved at send time (not stored) so a retry also recovers the "no address yet" case.

CREATE TABLE billing_outbound_emails (
    id              UUID        PRIMARY KEY,
    user_id         UUID        NOT NULL,
    kind            TEXT        NOT NULL,
    dedupe_key      TEXT        NOT NULL UNIQUE,
    subject         TEXT        NOT NULL,
    html_body       TEXT        NOT NULL,
    text_body       TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'pending',
    attempts        INT         NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL,
    sent_at         TIMESTAMPTZ
);

-- The drain claims due pending rows ordered by next_attempt_at; this index serves that scan.
CREATE INDEX billing_outbound_emails_due_idx
    ON billing_outbound_emails (status, next_attempt_at);
