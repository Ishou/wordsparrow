package com.bliss.grid.domain.model

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class WordTest {
    @Test
    fun `Word holds uppercase text and definition`() {
        val w = Word("CHAT", "felin domestique")
        assertThat(w.text).isEqualTo("CHAT")
        assertThat(w.definition).isEqualTo("felin domestique")
    }

    @Test
    fun `Word uppercases lowercase input`() {
        assertThat(Word("chat", "x").text).isEqualTo("CHAT")
    }

    @Test
    fun `Word uppercases mixed-case input`() {
        assertThat(Word("ChAt", "x").text).isEqualTo("CHAT")
    }

    @Test
    fun `Word rejects empty text`() {
        assertFailure { Word("", "x") }
    }

    @Test
    fun `Word rejects non-alphabetic characters`() {
        assertFailure { Word("CH1T", "x") }
    }

    @Test
    fun `Word rejects whitespace`() {
        assertFailure { Word("CH AT", "x") }
    }

    @Test
    fun `Word equality is structural`() {
        assertThat(Word("CHAT", "x")).isEqualTo(Word("chat", "x"))
    }

    @Test
    fun `Word defaults to no separators`() {
        assertThat(Word("CHAT", "x").separators).isEqualTo(emptyList<Int>())
    }

    @Test
    fun `fromSurface folds hyphens into separators and keeps an A-Z letter run`() {
        val w = Word.fromSurface("arc-en-ciel", "Phénomène coloré")
        assertThat(w.text).isEqualTo("ARCENCIEL")
        assertThat(w.separators).isEqualTo(listOf(3, 5))
    }

    @Test
    fun `fromSurface folds hyphens out of the lemma too`() {
        val w = Word.fromSurface("arc-en-ciel", "x", lemma = "arc-en-ciel")
        assertThat(w.lemma).isEqualTo("ARCENCIEL")
    }

    @Test
    fun `Word rejects a separator offset out of range`() {
        assertFailure { Word("ABC", "x", separators = listOf(3)) }
    }

    @Test
    fun `Word rejects non-increasing separators`() {
        assertFailure { Word("ABCDE", "x", separators = listOf(2, 2)) }
    }
}
