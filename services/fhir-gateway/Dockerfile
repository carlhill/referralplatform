# syntax=docker/dockerfile:1.7
# Build context is this directory (services/fhir-gateway) — unlike the Node
# services, this one is a self-contained Maven module with no monorepo
# workspace dependency.
#
#   docker build -f services/fhir-gateway/Dockerfile -t referralplatform/fhir-gateway services/fhir-gateway

FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build
# Local machines behind a TLS-inspecting proxy/antivirus (e.g. corporate MITM,
# AVG/Kaspersky web shields) can drop a root CA in certs/*.pem — gitignored,
# absent on other machines — and it gets trusted before any network fetch.
COPY certs ./certs
RUN for f in ./certs/*.pem; do \
      [ -e "$f" ] || continue; \
      keytool -importcert -noprompt -trustcacerts -alias "local-$(basename "$f")" \
        -file "$f" -keystore "$JAVA_HOME/lib/security/cacerts" -storepass changeit; \
    done
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
COPY --from=builder /build/target/fhir-gateway.jar ./fhir-gateway.jar
EXPOSE 3013
# Probe 127.0.0.1, never `localhost`: inside these containers `localhost` resolves to
# ::1 (IPv6) while the Node server listens IPv4-only on 0.0.0.0, so a `localhost`
# probe gets "connection refused" and the container sits `unhealthy` while serving
# traffic perfectly well - which also means any `depends_on: service_healthy` on it
# would never be satisfied. See BUILD_LOG/local-build-fixes.md.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3013/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "fhir-gateway.jar"]
