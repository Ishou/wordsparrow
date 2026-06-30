# syntax=docker/dockerfile:1
# billing-api image (ADR-0078, ADR-0007 §3): multi-stage JDK→JRE; base images pinned to digest.

# ---- Stage 1: build ------------------------------------------------------
# eclipse-temurin:21.0.11_10-jdk-alpine-3.23
FROM eclipse-temurin:21.0.11_10-jdk-alpine-3.23@sha256:4fb80de7aeb277ad949cfbe89b4f504e50bb34c57fd908c5825236473d71e986 AS build

WORKDIR /workspace

# Build scripts first so source-only edits keep the dep-resolve layer cached.
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle

# Gradle config phase needs every project's build.gradle.kts present; src/ not needed for :billing:api.
COPY grid/domain/build.gradle.kts grid/domain/
COPY grid/application/build.gradle.kts grid/application/
COPY grid/infrastructure/build.gradle.kts grid/infrastructure/
COPY grid/api/build.gradle.kts grid/api/
COPY grid/worker/build.gradle.kts grid/worker/

COPY game/domain/build.gradle.kts game/domain/
COPY game/application/build.gradle.kts game/application/
COPY game/infrastructure/build.gradle.kts game/infrastructure/
COPY game/api/build.gradle.kts game/api/

COPY identity/domain/build.gradle.kts identity/domain/
COPY identity/application/build.gradle.kts identity/application/
COPY identity/infrastructure/build.gradle.kts identity/infrastructure/
COPY identity/api/build.gradle.kts identity/api/

COPY survey/domain/build.gradle.kts survey/domain/
COPY survey/application/build.gradle.kts survey/application/
COPY survey/infrastructure/build.gradle.kts survey/infrastructure/
COPY survey/api/build.gradle.kts survey/api/
COPY survey/worker/build.gradle.kts survey/worker/

COPY billing/domain/build.gradle.kts billing/domain/
COPY billing/application/build.gradle.kts billing/application/
COPY billing/infrastructure/build.gradle.kts billing/infrastructure/
COPY billing/api/build.gradle.kts billing/api/

# Source for billing/ only; shadowJar transitively pulls domain, application, infrastructure.
COPY billing/domain/src billing/domain/src
COPY billing/application/src billing/application/src
COPY billing/infrastructure/src billing/infrastructure/src
COPY billing/api/src billing/api/src

RUN chmod +x gradlew && ./gradlew :billing:api:shadowJar --no-daemon --stacktrace

# ---- Stage 2: runtime ----------------------------------------------------
# eclipse-temurin:21.0.11_10-jre-alpine-3.23
FROM eclipse-temurin:21.0.11_10-jre-alpine-3.23@sha256:704db3c40204a44f471191446ddd9cda5d60dab40f0e15c6507b815ed897238b

# upgrade openssl past the pinned base digest for current Alpine security patches; drop after a base-image bump
RUN apk add --no-cache --upgrade openssl libssl3 libcrypto3

# wget is needed by HEALTHCHECK; declare explicitly to survive base-image swaps.
RUN apk add --no-cache wget

WORKDIR /app

COPY --from=build /workspace/billing/api/build/libs/billing-api-*-all.jar /app/billing-api.jar

# OTel Java agent (ADR-0027): auto-instruments Ktor+JDBC at JVM start via JAVA_TOOL_OPTIONS.
ADD --chmod=0644 \
    --checksum=sha256:bd01fea1304e8c8803fff827a0bdda02b2266742a85c62548053c6761474bb5b \
    https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.27.0/opentelemetry-javaagent.jar \
    /app/otel.jar

# Non-root: kubelet rejects pods where runAsNonRoot=true and image has no explicit USER.
RUN addgroup --system --gid 1000 ktor \
 && adduser --system --uid 1000 --ingroup ktor --no-create-home --shell /sbin/nologin ktor \
 && chown -R 1000:1000 /app
USER 1000:1000

# Port 8083 — grid/api owns 8080, game/api 8081, identity/api 8082, survey/api 7780.
EXPOSE 8083

# HEALTHCHECK for bare docker-run hygiene; Kubernetes uses the Helm chart's HTTP probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O - http://localhost:8083/v1/health || exit 1

CMD ["java", "-jar", "/app/billing-api.jar"]

# OCI annotations: source link and basic metadata for the GHCR package page.
LABEL org.opencontainers.image.source="https://github.com/Ishou/bliss"
LABEL org.opencontainers.image.description="WordSparrow Billing JVM API (Ktor REST)"
LABEL org.opencontainers.image.licenses="FSL-1.1-MIT"
