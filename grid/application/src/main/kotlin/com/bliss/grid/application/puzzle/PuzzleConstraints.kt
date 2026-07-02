package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.generation.GridConstraints

// Mirrors openapi.yaml PuzzleWidth/PuzzleHeight defaults (28/20, max 28); shared by GET fallback and daily pre-generation.
const val PUZZLE_WIDTH: Int = 28
const val PUZZLE_HEIGHT: Int = 20
const val PUZZLE_MIN_WORD_LENGTH: Int = 2

fun defaultPuzzleConstraints(): GridConstraints =
    GridConstraints(
        width = PUZZLE_WIDTH,
        height = PUZZLE_HEIGHT,
        minWordLength = PUZZLE_MIN_WORD_LENGTH,
    )
