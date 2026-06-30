plugins {
    kotlin("jvm")
    application
}

kotlin {
    jvmToolchain(21)
}

application {
    mainClass.set("com.bliss.billing.worker.MainKt")
    applicationName = "billing-worker"
}

val logbackVersion = "1.5.34"
val logstashEncoderVersion = "9.0"
val konsistVersion = "0.17.3"

dependencies {
    implementation(project(":billing:domain"))
    implementation(project(":billing:application"))
    implementation(project(":billing:infrastructure"))

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
    implementation("org.slf4j:slf4j-api:2.0.18")
    implementation("ch.qos.logback:logback-classic:$logbackVersion")
    implementation("net.logstash.logback:logstash-logback-encoder:$logstashEncoderVersion")

    testImplementation(platform("org.junit:junit-bom:5.14.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("com.willowtreeapps.assertk:assertk-jvm:0.28.1")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
    testImplementation(testFixtures(project(":billing:application")))
    testImplementation("com.lemonappdev:konsist:$konsistVersion")
}

tasks.test {
    useJUnitPlatform()
}
