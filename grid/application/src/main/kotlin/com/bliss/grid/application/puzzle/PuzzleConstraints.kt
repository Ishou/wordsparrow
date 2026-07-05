package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.generation.GridConstraints

// Mirrors openapi.yaml PuzzleWidth/PuzzleHeight defaults (28/20, max 28); shared by GET fallback and daily pre-generation.
const val PUZZLE_WIDTH: Int = 28
const val PUZZLE_HEIGHT: Int = 20
const val PUZZLE_MIN_WORD_LENGTH: Int = 2

// Low-density levers (ADR-0095): a few anchored long runs + per-axis run caps yield airier,
// more print-like grids (~28% -> ~23% black) without harming fillability.
const val PUZZLE_ANCHOR_COUNT: Int = 3
const val PUZZLE_LTARGET_HORIZONTAL: Int = 11
const val PUZZLE_LTARGET_VERTICAL: Int = 8

fun defaultPuzzleConstraints(): GridConstraints =
    GridConstraints(
        width = PUZZLE_WIDTH,
        height = PUZZLE_HEIGHT,
        minWordLength = PUZZLE_MIN_WORD_LENGTH,
        anchorCount = PUZZLE_ANCHOR_COUNT,
        lTargetHorizontal = PUZZLE_LTARGET_HORIZONTAL,
        lTargetVertical = PUZZLE_LTARGET_VERTICAL,
    )
