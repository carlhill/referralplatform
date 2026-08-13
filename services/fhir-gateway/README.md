# fhir-gateway

Integration & FHIR Gateway — the one deliberately polyglot service in the platform
(Java/Spring Boot/HAPI FHIR, not NestJS). See `claude/solution-architecture-tech-stack.md`
("Exception — the FHIR/interoperability layer is Java") for why, and
`claude/modules-and-requirements.md` (service #14) for its full scope: My Health
Record conformance, Healthcare Identifiers Service (IHI/HPI-O/HPI-I) lookups, NASH
signing, and the structured FHIR export capability.

## Stack

- Java 21, Spring Boot 3.3.x, [HAPI FHIR](https://hapifhir.io/) 7.4.x (R4 structures)
- Maven (`pom.xml`) — this is the only Maven module in the repo; it is **not** part of
  the root npm workspaces.

## Run locally

```bash
cd services/fhir-gateway
cp .env.example .env   # then export its values, or use your IDE's run config
mvn spring-boot:run
# -> http://localhost:3013/actuator/health
# -> http://localhost:3013/fhir/metadata  (a real HAPI FHIR-generated CapabilityStatement)
```

## Build / test

```bash
mvn clean verify
```

> **Note for whoever runs this first**: this skeleton was generated in a sandboxed
> environment whose network policy blocked Maven Central, so `mvn clean verify` could
> not be executed there to confirm the build. Confirm it succeeds in a normal
> dev/CI environment (see `.github/workflows/ci.yml`, `fhir-gateway` job) before
> building on top of it.

## Docker

Unlike the Node services, this one builds from its own directory as context (no
monorepo workspace dependency to bring along):

```bash
docker build -f services/fhir-gateway/Dockerfile -t referralplatform/fhir-gateway services/fhir-gateway
```
