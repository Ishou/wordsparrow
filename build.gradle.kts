plugins {
    kotlin("jvm") version "2.3.21" apply false
    id("com.diffplug.spotless") version "8.4.0"
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

    // Force-bump vulnerable transitives to their patched release across every
    // project configuration. Direct deps would have been the cleaner home, but
    // every entry here is pulled in transitively (Testcontainers, Shadow plugin
    // etc.) so the resolution rule is the surgical instrument.
    configurations.configureEach {
        resolutionStrategy.eachDependency {
            when ("${requested.group}:${requested.name}") {
                "org.apache.commons:commons-compress" -> {
                    useVersion("1.26.0")
                    because("Dependabot #19,#20 — Testcontainers 1.21.4 still ships 1.24.0")
                }
                "org.apache.logging.log4j:log4j-core" -> {
                    useVersion("2.25.4")
                    because("Dependabot #16,#17,#18 — Shadow plugin transitive at 2.25.3")
                }
                "org.codehaus.plexus:plexus-utils" -> {
                    useVersion("4.0.3")
                    because("Dependabot #15 — Shadow plugin transitive at 4.0.2 has CVE-2025-* path traversal in extractFile")
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
}
