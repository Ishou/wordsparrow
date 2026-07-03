package com.bliss.identity.infrastructure.auth

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class Sha256TokenHasherTest {
    private val hasher = Sha256TokenHasher()

    @Test
    fun `hashes the empty string to the known SHA-256 vector`() {
        assertThat(hasher.hash(""))
            .isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    }

    @Test
    fun `hashes abc to the known SHA-256 vector`() {
        assertThat(hasher.hash("abc"))
            .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test
    fun `produces a 64-character lowercase hex digest`() {
        val digest = hasher.hash("012345")
        assertThat(digest.length).isEqualTo(64)
        assertThat(digest.all { it in "0123456789abcdef" }).isEqualTo(true)
    }

    @Test
    fun `is deterministic for the same input`() {
        assertThat(hasher.hash("some-secret")).isEqualTo(hasher.hash("some-secret"))
    }
}
