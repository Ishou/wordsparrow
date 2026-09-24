package com.bliss.grid.domain.model

import java.text.Normalizer

private val DIACRITICS = "\\p{InCombiningDiacriticalMarks}+".toRegex()

/** Folds text to the grid-cell surface `Word.text` is stored in: NFD, combining marks stripped, French ligatures expanded (they do not decompose under NFD), uppercased. */
fun foldToGridText(text: String): String =
    DIACRITICS
        .replace(Normalizer.normalize(text, Normalizer.Form.NFD), "")
        .replace("œ", "oe")
        .replace("Œ", "OE")
        .replace("æ", "ae")
        .replace("Æ", "AE")
        .uppercase()
