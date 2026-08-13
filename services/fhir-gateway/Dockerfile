# syntax=docker/dockerfile:1.7
# Build context is this directory (services/fhir-gateway) — unlike the Node
# services, this one is a self-contained Maven module with no monorepo
# workspace dependency.
#
#   docker build -f services/fhir-gateway/Dockerfile -t referralplatform/fhir-gateway services/fhir-gateway

FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
COPY --from=builder /build/target/fhir-gateway.jar ./fhir-gateway.jar
EXPOSE 3013
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://localhost:3013/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "fhir-gateway.jar"]
