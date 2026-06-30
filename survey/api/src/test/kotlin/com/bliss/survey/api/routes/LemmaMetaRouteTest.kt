package com.bliss.survey.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.survey.api.auth.SESSION_COOKIE_NAME
import com.bliss.survey.application.usecases.LemmaMeta
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test

class LemmaMetaRouteTest {
    private fun ApplicationTestBuilder.install(getLemmaMeta: suspend (String) -> LemmaMeta) {
        application {
            installCapabilitySession()
            install(ContentNegotiation) { json() }
            routing {
                lemmaMetaRoute(getLemmaMeta)
            }
        }
    }

    @Test
    fun `maintainer - get returns empty arrays when lemma has no prior meta`() =
        testApplication {
            install(getLemmaMeta = { LemmaMeta(emptyList(), emptyList()) })
            val r = client.get("/v1/lemma-meta/chat") { cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE) }
            assertThat(r.status).isEqualTo(HttpStatusCode.OK)
            assertThat(r.bodyAsText()).contains("\"priorSenses\":[]")
            assertThat(r.bodyAsText()).contains("\"priorSubTags\":[]")
        }

    @Test
    fun `maintainer - get returns aggregated prior meta`() =
        testApplication {
            val meta = LemmaMeta(priorSenses = listOf("animal félin"), priorSubTags = listOf("felin"))
            install(getLemmaMeta = { if (it == "chat") meta else LemmaMeta(emptyList(), emptyList()) })
            val r = client.get("/v1/lemma-meta/chat") { cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE) }
            assertThat(r.status).isEqualTo(HttpStatusCode.OK)
            assertThat(r.bodyAsText()).contains("animal félin")
            assertThat(r.bodyAsText()).contains("felin")
        }

    @Test
    fun `maintainer - get with blank mot returns 400`() =
        testApplication {
            install(getLemmaMeta = { LemmaMeta(emptyList(), emptyList()) })
            val r = client.get("/v1/lemma-meta/%20") { cookie(SESSION_COOKIE_NAME, MAINTAINER_COOKIE) }
            assertThat(r.status).isEqualTo(HttpStatusCode.BadRequest)
        }

    // ADR-0079: contribuer is maintainer-only; non-maintainer callers are denied 403.
    @Test
    fun `player - 403 forbidden`() =
        testApplication {
            install(getLemmaMeta = { LemmaMeta(emptyList(), emptyList()) })
            val r = client.get("/v1/lemma-meta/chat") { cookie(SESSION_COOKIE_NAME, PLAYER_COOKIE) }
            assertThat(r.status).isEqualTo(HttpStatusCode.Forbidden)
            assertThat(r.bodyAsText()).contains("réservée aux mainteneurs")
        }

    @Test
    fun `anonymous - 403 forbidden`() =
        testApplication {
            install(getLemmaMeta = { LemmaMeta(emptyList(), emptyList()) })
            val r = client.get("/v1/lemma-meta/chat")
            assertThat(r.status).isEqualTo(HttpStatusCode.Forbidden)
        }
}
