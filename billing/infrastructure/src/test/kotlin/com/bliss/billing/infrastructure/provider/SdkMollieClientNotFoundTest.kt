package com.bliss.billing.infrastructure.provider

import assertk.assertThat
import assertk.assertions.isNull
import com.mollie.mollie.Client
import com.mollie.mollie.models.components.Security
import com.mollie.mollie.utils.HTTPClient
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpHeaders
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.Optional
import javax.net.ssl.SSLSession

// Reproduces the ErrorResponse/hal+json shape seen in prod; see SdkMollieClient's ClientError catch.
class SdkMollieClientNotFoundTest {
    private fun clientReturning(
        status: Int,
        body: String,
    ): SdkMollieClient {
        val transport =
            object : HTTPClient {
                override fun send(request: HttpRequest): HttpResponse<InputStream> =
                    object : HttpResponse<InputStream> {
                        override fun statusCode() = status

                        override fun request() = request

                        override fun previousResponse(): Optional<HttpResponse<InputStream>> = Optional.empty()

                        override fun headers(): HttpHeaders =
                            HttpHeaders.of(mapOf("Content-Type" to listOf("application/hal+json"))) { _, _ -> true }

                        override fun body(): InputStream = ByteArrayInputStream(body.toByteArray())

                        override fun sslSession(): Optional<SSLSession> = Optional.empty()

                        override fun uri(): URI = request.uri()

                        override fun version(): HttpClient.Version = HttpClient.Version.HTTP_1_1
                    }
            }
        val sdk =
            Client
                .builder()
                .security(Security.builder().apiKey("test_dummy").build())
                .client(transport)
                .build()
        return SdkMollieClient(sdk)
    }

    @Test
    fun `getPayment returns null when Mollie answers 404 with an ErrorResponse body`() =
        runTest {
            val body =
                """{"status":404,"title":"Not Found","detail":"Payment tr_x exists, but the wrong mode is used.","_links":{"documentation":{"href":"https://docs.mollie.com/reference/handling-errors","type":"text/html"}}}"""
            assertThat(clientReturning(404, body).getPayment("tr_x")).isNull()
        }

    @Test
    fun `cancelSubscription reports gone when Mollie answers 404 with an ErrorResponse body`() =
        runTest {
            val body =
                """{"status":404,"title":"Not Found","detail":"No subscription exists with token sub_x.","_links":{"documentation":{"href":"https://docs.mollie.com/reference/handling-errors","type":"text/html"}}}"""
            assertThrows<MollieResourceGoneException> {
                clientReturning(404, body).cancelSubscription("cst_x", "sub_x")
            }
        }
}
