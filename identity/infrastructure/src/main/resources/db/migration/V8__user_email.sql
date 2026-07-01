-- Canonical player email from the IdP, retained for legal invoicing (ADR-0082, supersedes ADR-0045). Nullable; erased with the row on RGPD delete.
ALTER TABLE identity_users ADD COLUMN email TEXT;
