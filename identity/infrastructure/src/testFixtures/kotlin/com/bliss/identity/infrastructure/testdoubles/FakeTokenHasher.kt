package com.bliss.identity.infrastructure.testdoubles

import com.bliss.identity.application.ports.TokenHasher

/** Deterministic non-cryptographic stub — mirrors the SHA-256 hasher's one-way shape for tests. */
class FakeTokenHasher : TokenHasher {
    override fun hash(raw: String): String = "sha256:$raw"
}
