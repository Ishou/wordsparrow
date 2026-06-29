plugins {
    kotlin("jvm")
    kotlin("plugin.serialization") version "2.3.21"
}

kotlin {
    jvmToolchain(21)
}

val testcontainersVersion = "1.21.4"

dependencies {
    implementation(project(":billing:domain"))
    implementation(project(":billing:application"))

    implementation("org.postgresql:postgresql:42.7.11")
    implementation("com.zaxxer:HikariCP:7.1.0")
    implementation("org.flywaydb:flyway-core:12.8.1")
    implementation("org.flywaydb:flyway-database-postgresql:12.8.1")
    implementation("org.slf4j:slf4j-api:2.0.18")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")

    // kotlinx-serialization — EntitlementChanged JSON payload on the NATS wire (ADR-0078).
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

    // NATS JetStream client — the EntitlementChanged cross-context publisher (ADR-0049, ADR-0078).
    implementation("io.nats:jnats:2.25.3")

    // Official Mollie Java SDK (BSD-2-Clause); the billing provider adapter named in ADR-0078.
    implementation("com.mollie:mollie:1.8.14")

    testImplementation(platform("org.junit:junit-bom:5.14.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("com.willowtreeapps.assertk:assertk-jvm:0.28.1")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
    testImplementation("com.lemonappdev:konsist:0.17.3")

    testImplementation("org.testcontainers:testcontainers:$testcontainersVersion")
    testImplementation("org.testcontainers:junit-jupiter:$testcontainersVersion")
    testImplementation("org.testcontainers:postgresql:$testcontainersVersion")
}

tasks.test {
    useJUnitPlatform()
}
