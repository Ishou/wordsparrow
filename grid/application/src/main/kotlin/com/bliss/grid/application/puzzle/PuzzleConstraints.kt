package com.bliss.grid.application.puzzle

import com.bliss.grid.domain.generation.GridConstraints

// Mirrors openapi.yaml PuzzleWidth/PuzzleHeight defaults (28/20, max 28); the on-demand GET fallback (daily uses DAILY_* below).
const val PUZZLE_WIDTH: Int = 28
const val PUZZLE_HEIGHT: Int = 20
const val PUZZLE_MIN_WORD_LENGTH: Int = 2

// Low-density levers (ADR-0095): a few anchored long runs + per-axis run caps yield airier,
// more print-like grids (~28% -> ~23% black) without harming fillability.
const val PUZZLE_ANCHOR_COUNT: Int = 3
const val PUZZLE_LTARGET_HORIZONTAL: Int = 11
const val PUZZLE_LTARGET_VERTICAL: Int = 8

// Daily grid: re-scaled ADR-0095 knobs at 22×15 — see ADR-0095 Consequences.
const val DAILY_PUZZLE_WIDTH: Int = 22
const val DAILY_PUZZLE_HEIGHT: Int = 15
const val DAILY_PUZZLE_ANCHOR_COUNT: Int = 3
const val DAILY_PUZZLE_LTARGET_HORIZONTAL: Int = 9
const val DAILY_PUZZLE_LTARGET_VERTICAL: Int = 6
const val DAILY_PUZZLE_ANCHOR_LENGTH: Int = 10

fun defaultPuzzleConstraints(): GridConstraints =
    GridConstraints(
        width = PUZZLE_WIDTH,
        height = PUZZLE_HEIGHT,
        minWordLength = PUZZLE_MIN_WORD_LENGTH,
        anchorCount = PUZZLE_ANCHOR_COUNT,
        lTargetHorizontal = PUZZLE_LTARGET_HORIZONTAL,
        lTargetVertical = PUZZLE_LTARGET_VERTICAL,
    )

fun dailyPuzzleConstraints(): GridConstraints =
    GridConstraints(
        width = DAILY_PUZZLE_WIDTH,
        height = DAILY_PUZZLE_HEIGHT,
        minWordLength = PUZZLE_MIN_WORD_LENGTH,
        anchorCount = DAILY_PUZZLE_ANCHOR_COUNT,
        anchorLength = DAILY_PUZZLE_ANCHOR_LENGTH,
        lTargetHorizontal = DAILY_PUZZLE_LTARGET_HORIZONTAL,
        lTargetVertical = DAILY_PUZZLE_LTARGET_VERTICAL,
    )
