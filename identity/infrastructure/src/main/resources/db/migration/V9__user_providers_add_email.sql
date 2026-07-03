-- Expand step (ADR-0091): widen the CHECK before 'email' links are written; identity_auth_attempts stays OIDC-only.
ALTER TABLE identity_user_providers DROP CONSTRAINT identity_user_providers_provider_check;
ALTER TABLE identity_user_providers ADD CONSTRAINT identity_user_providers_provider_check
    CHECK (provider IN ('google', 'apple', 'email'));
