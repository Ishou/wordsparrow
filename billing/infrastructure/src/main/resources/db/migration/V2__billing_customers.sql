-- billing_customers: opaque userId -> Mollie customer mapping so a returning user reuses one provider Customer (ADR-0078: no PII, provider stays system-of-record).

CREATE TABLE billing_customers (
    user_id            UUID        NOT NULL PRIMARY KEY,
    mollie_customer_id TEXT        NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL
);

-- A Mollie customer maps to at most one local user (reverse lookup / drift detection).
CREATE UNIQUE INDEX billing_customers_mollie_customer_id_idx ON billing_customers (mollie_customer_id);
