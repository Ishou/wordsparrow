-- subscription-derived entitlement (ADR-0080); ON DELETE CASCADE keeps RGPD erasure automatic (ADR-0075 pattern).
CREATE TABLE identity_user_subscription (
    user_id    UUID PRIMARY KEY REFERENCES identity_users (user_id) ON DELETE CASCADE,
    tier       TEXT NOT NULL CHECK (tier IN ('free', 'subscriber')),
    changed_at TIMESTAMPTZ NOT NULL
);
