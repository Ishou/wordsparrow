package com.bliss.grid.application.correction

import com.bliss.grid.domain.generation.WordRepository
import com.bliss.grid.domain.model.WordClue

/** Returns every clue a corpus word carries for the maintainer correction picker; null means no such word (ADR-0108). */
class ListWordCluesUseCase(
    private val corpus: WordRepository,
) {
    // Cooldown-unfiltered by design (ADR-0031): the maintainer may pick any alternate definition to replace the reported one.
    fun execute(word: String): List<WordClue>? = corpus.findByText(word)?.clues
}
