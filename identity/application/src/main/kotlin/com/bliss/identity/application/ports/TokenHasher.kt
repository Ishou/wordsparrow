package com.bliss.identity.application.ports

fun interface TokenHasher {
    fun hash(raw: String): String
}
