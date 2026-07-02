package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.generation.GridConstraints

// grid/api/openapi.yaml PuzzleWidth/PuzzleHeight: default 15 / 12, maximum 15.
// This is the on-demand `GET /v1/puzzles/{puzzleId}` fallback when width/height
// are omitted -- keep in sync with the schema, not with DAILY_PUZZLE_WIDTH/HEIGHT.
const val PUZZLE_WIDTH: Int = 15
const val PUZZLE_HEIGHT: Int = 12
const val PUZZLE_MIN_WORD_LENGTH: Int = 2

// Daily pre-generation only (grid/worker); not exposed as a request-time bound.
const val DAILY_PUZZLE_WIDTH: Int = 28
const val DAILY_PUZZLE_HEIGHT: Int = 20

fun defaultPuzzleConstraints(): GridConstraints =
    GridConstraints(
        width = PUZZLE_WIDTH,
        height = PUZZLE_HEIGHT,
        minWordLength = PUZZLE_MIN_WORD_LENGTH,
    )

fun dailyPuzzleConstraints(): GridConstraints =
    GridConstraints(
        width = DAILY_PUZZLE_WIDTH,
        height = DAILY_PUZZLE_HEIGHT,
        minWordLength = PUZZLE_MIN_WORD_LENGTH,
    )
