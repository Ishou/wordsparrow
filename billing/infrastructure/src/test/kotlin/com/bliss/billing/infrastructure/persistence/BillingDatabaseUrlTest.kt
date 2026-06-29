package com.bliss.billing.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class BillingDatabaseUrlTest {
    @Test
    fun `toJdbcUrl converts postgres scheme to jdbc postgresql`() {
        assertThat(BillingDatabase.toJdbcUrl("postgres://user:pw@host:5432/db"))
            .isEqualTo("jdbc:postgresql://host:5432/db")
    }

    @Test
    fun `toJdbcUrl preserves query string`() {
        assertThat(BillingDatabase.toJdbcUrl("postgres://user:pw@host:5432/db?sslmode=require"))
            .isEqualTo("jdbc:postgresql://host:5432/db?sslmode=require")
    }

    @Test
    fun `toJdbcUrl wraps bare IPv6 host in brackets`() {
        assertThat(BillingDatabase.toJdbcUrl("postgres://user:pw@[::1]:5432/db"))
            .isEqualTo("jdbc:postgresql://[::1]:5432/db")
    }

    @Test
    fun `toJdbcUrl defaults to port 5432 when port is absent`() {
        assertThat(BillingDatabase.toJdbcUrl("postgres://user:pw@host/db"))
            .isEqualTo("jdbc:postgresql://host:5432/db")
    }

    @Test
    fun `toJdbcUrl passes jdbc URLs through unchanged`() {
        val jdbcUrl = "jdbc:postgresql://host:5432/db"
        assertThat(BillingDatabase.toJdbcUrl(jdbcUrl)).isEqualTo(jdbcUrl)
    }

    @Test
    fun `toJdbcUrl rejects unsupported scheme`() {
        assertThrows<IllegalArgumentException> {
            BillingDatabase.toJdbcUrl("mysql://host:3306/db")
        }
    }

    @Test
    fun `extractCredentials returns user and password`() {
        val (user, password) = BillingDatabase.extractCredentials("postgres://alice:secret@host:5432/db")
        assertThat(user).isEqualTo("alice")
        assertThat(password).isEqualTo("secret")
    }

    @Test
    fun `extractCredentials preserves colons in password`() {
        val (user, password) = BillingDatabase.extractCredentials("postgres://alice:sec:ret@host:5432/db")
        assertThat(user).isEqualTo("alice")
        assertThat(password).isEqualTo("sec:ret")
    }

    @Test
    fun `extractCredentials returns nulls for jdbc URLs`() {
        val (user, password) = BillingDatabase.extractCredentials("jdbc:postgresql://host:5432/db")
        assertThat(user).isNull()
        assertThat(password).isNull()
    }
}
