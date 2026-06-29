package com.bliss.billing.domain.architecture

import com.lemonappdev.konsist.api.Konsist
import com.lemonappdev.konsist.api.verify.assertFalse
import org.junit.jupiter.api.Test

class BillingArchitectureTest {
    private val domainScope = Konsist.scopeFromModule("billing/domain")

    @Test
    fun `domain has no infrastructure imports`() {
        domainScope.files.assertFalse {
            it.hasImport { import -> import.name.contains("infrastructure") }
        }
    }

    @Test
    fun `domain has no application imports`() {
        domainScope.files.assertFalse {
            it.hasImport { import -> import.name.startsWith("com.bliss.billing.application") }
        }
    }

    @Test
    fun `domain has no framework imports`() {
        val forbiddenPrefixes =
            listOf(
                "org.springframework",
                "jakarta.",
                "javax.",
                "io.ktor",
                "org.http4k",
                "org.jetbrains.exposed",
                "io.micronaut",
            )
        domainScope.files.assertFalse {
            it.hasImport { import ->
                forbiddenPrefixes.any { prefix -> import.name.startsWith(prefix) }
            }
        }
    }

    @Test
    fun `domain has no vendor sdk imports`() {
        val forbiddenPrefixes =
            listOf(
                "com.mollie",
                "be.woutschoovaerts",
                "com.anthropic",
                "software.amazon",
                "com.amazonaws",
                "com.google.cloud",
                "com.azure",
            )
        domainScope.files.assertFalse {
            it.hasImport { import ->
                forbiddenPrefixes.any { prefix -> import.name.startsWith(prefix) }
            }
        }
    }

    @Test
    fun `domain has no cross-context imports`() {
        val otherContexts =
            listOf(
                "com.bliss.grid",
                "com.bliss.game",
                "com.bliss.identity",
                "com.bliss.survey",
            )
        domainScope.files.assertFalse {
            it.hasImport { import ->
                otherContexts.any { prefix -> import.name.startsWith(prefix) }
            }
        }
    }
}
