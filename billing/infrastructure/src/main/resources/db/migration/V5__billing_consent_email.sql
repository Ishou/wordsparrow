-- Store the session-derived email captured at checkout so contract/renewal/résiliation emails have an address even when the create-once Mollie customer predates email capture (ADR-0094 §1; ADR-0082 absent-until-captured). Nullable for expand-and-contract; never in the request body (ADR-0078).
ALTER TABLE billing_checkout_consents ADD COLUMN email TEXT;
