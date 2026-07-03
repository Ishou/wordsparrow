-- OTP challenges (ADR-0091): code_hash/binding_hash are SHA-256 hex, never plaintext; TTL cleanup via expires_at.
CREATE TABLE identity_email_otp_challenges (
    challenge_id  UUID        PRIMARY KEY,
    email         TEXT        NOT NULL,
    code_hash     TEXT        NOT NULL,
    binding_hash  TEXT        NOT NULL,
    attempts      INT         NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL,
    expires_at    TIMESTAMPTZ NOT NULL,
    consumed_at   TIMESTAMPTZ
);

CREATE INDEX idx_identity_email_otp_challenges_email ON identity_email_otp_challenges (email);
CREATE INDEX idx_identity_email_otp_challenges_expires_at ON identity_email_otp_challenges (expires_at);
