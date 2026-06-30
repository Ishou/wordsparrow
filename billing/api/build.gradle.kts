// billing/api Ktor edge (ADR-0078, ADR-0006). Mirrors survey/api pinning so the Ktor stack stays uniform.

plugins {
    kotlin("jvm")
    kotlin("plugin.serialization") version "2.3.21"
    application
    id("com.gradleup.shadow") version "9.4.2"
}

version = "0.1.0"

kotlin {
    jvmToolchain(21)
}

val ktorVersion = "3.5.0"
val kotlinxSerializationVersion = "1.11.0"
val logbackVersion = "1.5.34"
val logstashEncoderVersion = "9.0"
val junitVersion = "5.14.4"
val assertkVersion = "0.28.1"
val konsistVersion = "0.17.3"

application {
    mainClass.set("com.bliss.billing.api.MainKt")
}

dependencies {
    // Flyway 12.8.1 (transitive via :billing:infrastructure) pulls jackson-bom 3.1.1; force jackson 3.x to 3.2.0 for the CVE-fixed databind.
    constraints {
        implementation("tools.jackson.core:jackson-core:3.2.0")
        implementation("tools.jackson.core:jackson-databind:3.2.0")
    }

    // Billing bounded-context inner layers (ADR-0001 §1).
    implementation(project(":billing:domain"))
    implementation(project(":billing:application"))
    implementation(project(":billing:infrastructure"))

    // UUID v7 generator for the EventIdGenerator port.
    implementation("com.fasterxml.uuid:java-uuid-generator:5.2.0")

    // NATS JetStream client (ADR-0049, ADR-0078).
    implementation("io.nats:jnats:2.25.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")

    // Ktor server core + CIO engine.
    implementation("io.ktor:ktor-server-core:$ktorVersion")
    implementation("io.ktor:ktor-server-cio:$ktorVersion")

    // ContentNegotiation + kotlinx-serialization JSON.
    implementation("io.ktor:ktor-server-content-negotiation:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:$kotlinxSerializationVersion")

    // Status pages (RFC 7807) + call logging + CORS.
    implementation("io.ktor:ktor-server-status-pages:$ktorVersion")
    implementation("io.ktor:ktor-server-call-logging:$ktorVersion")
    implementation("io.ktor:ktor-server-cors:$ktorVersion")

    // Ktor client + CIO engine — the whoami session-verify call (ADR-0044); no identity import.
    implementation("io.ktor:ktor-client-core:$ktorVersion")
    implementation("io.ktor:ktor-client-cio:$ktorVersion")
    implementation("io.ktor:ktor-client-content-negotiation:$ktorVersion")

    // Structured JSON logging stack (ADR-0007 §7), parity with survey/api.
    implementation("ch.qos.logback:logback-classic:$logbackVersion")
    implementation("net.logstash.logback:logstash-logback-encoder:$logstashEncoderVersion")
    implementation("org.slf4j:slf4j-api:2.0.18")

    testImplementation(platform("org.junit:junit-bom:$junitVersion"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("com.willowtreeapps.assertk:assertk-jvm:$assertkVersion")
    testImplementation("io.ktor:ktor-server-test-host:$ktorVersion")
    testImplementation("io.ktor:ktor-client-content-negotiation:$ktorVersion")
    testImplementation("io.ktor:ktor-client-mock:$ktorVersion")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
    testImplementation("com.lemonappdev:konsist:$konsistVersion")

    // Reuse the application layer's in-memory boundary fakes so route tests run real use cases (CLAUDE.md: mock only at boundaries).
    testImplementation(testFixtures(project(":billing:application")))
}

tasks.test {
    useJUnitPlatform()
}

tasks.shadowJar {
    archiveBaseName.set("billing-api")
    archiveClassifier.set("all")
    // INCLUDE prevents Shadow 9.x from dropping Flyway SPI entries before mergeServiceFiles.
    duplicatesStrategy = org.gradle.api.file.DuplicatesStrategy.INCLUDE
    mergeServiceFiles()
}
