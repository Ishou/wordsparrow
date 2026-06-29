package com.bliss.grid.application.words

import com.bliss.grid.domain.generation.WordRepository
import com.bliss.grid.domain.model.Word
import kotlin.random.Random

/** Draws a count-capped random sample of clue-answer pairs for the home teaser (ADR-0073). */
class SampleWordsUseCase(
    private val wordRepository: WordRepository,
    private val random: Random,
    private val tokenMinter: AnswerTokenMinter,
) {
    operator fun invoke(
        minLen: Int,
        maxLen: Int,
        count: Int,
    ): List<SampleWord> {
        val low = minLen.coerceIn(MIN_LENGTH, MAX_LENGTH)
        val high = maxLen.coerceIn(low, MAX_LENGTH)
        val take = count.coerceIn(MIN_COUNT, MAX_COUNT)

        val byLemma = LinkedHashMap<String, Word>()
        for (length in low..high) {
            for (word in wordRepository.findByLength(length)) {
                byLemma.putIfAbsent(word.lemma, word)
            }
        }

        return byLemma.values
            .map {
                SampleWord(
                    clue = pickClue(it),
                    answerLength = it.text.length,
                    token = tokenMinter.mint(it.text),
                    answer = it.text,
                )
            }.shuffled(random)
            .take(take)
    }

    private fun pickClue(word: Word): String = word.clues.random(random).text

    companion object {
        const val MIN_LENGTH: Int = 3
        const val MAX_LENGTH: Int = 6
        const val MIN_COUNT: Int = 1
        const val MAX_COUNT: Int = 50
    }
}
