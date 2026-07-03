package com.bliss.identity.infrastructure.auth

import com.bliss.identity.application.ports.TokenHasher
import java.security.MessageDigest

class Sha256TokenHasher : TokenHasher {
    override fun hash(raw: String): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(raw.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}
