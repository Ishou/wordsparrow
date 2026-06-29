package com.bliss.billing.application.architecture

import com.lemonappdev.konsist.api.Konsist
import com.lemonappdev.konsist.api.verify.assertFalse
import org.junit.jupiter.api.Test

class BillingApplicationArchitectureTest {
    private val applicationScope = Konsist.scopeFromModule("billing/application")

    @Test
    fun `application has no infrastructure imports`() {
        applicationScope.files.assertFalse {
            it.hasImport { import -> import.name.contains("infrastructure") }
        }
    }

    @Test
    fun `application has no framework imports`() {
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
        applicationScope.files.assertFalse {
            it.hasImport { import ->
                forbiddenPrefixes.any { prefix -> import.name.startsWith(prefix) }
            }
        }
    }

    @Test
    fun `application has no vendor sdk imports`() {
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
        applicationScope.files.assertFalse {
            it.hasImport { import ->
                forbiddenPrefixes.any { prefix -> import.name.startsWith(prefix) }
            }
        }
    }

    @Test
    fun `application has no cross-context imports`() {
        val otherContexts =
            listOf(
                "com.bliss.grid",
                "com.bliss.game",
                "com.bliss.identity",
                "com.bliss.survey",
            )
        applicationScope.files.assertFalse {
            it.hasImport { import ->
                otherContexts.any { prefix -> import.name.startsWith(prefix) }
            }
        }
    }
}
