import com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar
import com.github.jengelman.gradle.plugins.shadow.transformers.ApacheLicenseResourceTransformer
import com.github.jengelman.gradle.plugins.shadow.transformers.ApacheNoticeResourceTransformer

plugins {
    kotlin("jvm") version "2.3.21" apply false
    id("com.diffplug.spotless") version "8.6.0"
    // apply false puts Shadow on the root script classpath so the shadowJar block below can name its transformer types.
    id("com.gradleup.shadow") version "9.4.2" apply false
}

allprojects {
    repositories {
        mavenCentral()
    }
}

subprojects {
    apply(plugin = "com.diffplug.spotless")
    extensions.configure<com.diffplug.gradle.spotless.SpotlessExtension> {
        kotlin {
            target("src/**/*.kt")
            ktlint("1.5.0")
        }
        kotlinGradle {
            target("*.gradle.kts")
            ktlint("1.5.0")
        }
    }

    // resolution rule because every dep here is a transitive we can't pin at source
    configurations.configureEach {
        resolutionStrategy.eachDependency {
            when ("${requested.group}:${requested.name}") {
                "org.apache.commons:commons-compress" -> {
                    useVersion("1.26.0")
                    because("Testcontainers 1.21.4 still ships 1.24.0")
                }
                "org.apache.commons:commons-lang3" -> {
                    useVersion("3.18.0")
                    because("commons-compress 1.26.0 pulls 3.14.0 — uncontrolled recursion CVE")
                }
                "org.apache.logging.log4j:log4j-core" -> {
                    useVersion("2.25.4")
                    because("Shadow plugin 9.4.1 still ships 2.25.3")
                }
                "org.codehaus.plexus:plexus-utils" -> {
                    useVersion("4.0.3")
                    because("Shadow plugin 9.4.1 ships 4.0.2 — path traversal in extractFile")
                }
                "com.squareup.okio:okio" -> {
                    useVersion("3.4.0")
                    because("moshi 1.13.0 (via lingua 1.2.2 → survey:infrastructure) pulls okio 2.10.0 — GHSA-jq43-q8mx-r7mq")
                }
            }
        }
    }

    buildscript {
        configurations.configureEach {
            resolutionStrategy.eachDependency {
                when ("${requested.group}:${requested.name}") {
                    "org.apache.logging.log4j:log4j-core" -> useVersion("2.25.4")
                    "org.codehaus.plexus:plexus-utils" -> useVersion("4.0.3")
                }
            }
        }
    }

    // Shadow clobbers same-path META-INF/LICENSE*/NOTICE* when it merges the ~40 bundled jars; restore them so each fat jar keeps its Apache-2.0 §4(d) / MIT / BSD redistribution notices.
    plugins.withId("com.gradleup.shadow") {
        tasks.named<ShadowJar>("shadowJar") {
            // Merge (not clobber) the license/notice files the jars do carry.
            transform<ApacheLicenseResourceTransformer>()
            transform<ApacheNoticeResourceTransformer>()
        }
    }
}
