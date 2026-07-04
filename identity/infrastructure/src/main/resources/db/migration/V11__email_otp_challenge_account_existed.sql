-- Nullable per expand-and-contract (ADR-0093): pre-V11 rows stay NULL; the new-account count treats NULL as not-counted.
ALTER TABLE identity_email_otp_challenges
    ADD COLUMN account_existed boolean;
