package com.bliss.grid.domain.model

/** (letter run, offsets where a hyphen precedes that cell), or null if not an A-Z + interior-hyphen surface. */
object HyphenSurface {
    fun split(surface: String): Pair<String, List<Int>>? {
        val letters = StringBuilder()
        val offsets = mutableListOf<Int>()
        for (ch in surface) {
            when {
                ch in 'A'..'Z' -> letters.append(ch)
                ch == '-' -> {
                    val offset = letters.length
                    if (offset == 0 || offsets.lastOrNull() == offset) return null
                    offsets.add(offset)
                }
                else -> return null
            }
        }
        if (letters.isEmpty() || offsets.lastOrNull() == letters.length) return null
        return letters.toString() to offsets.toList()
    }
}
