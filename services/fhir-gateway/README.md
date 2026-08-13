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

## What's actually implemented

See `BUILD_LOG/fhir-gateway.md` for the full write-up. Summary:

- **Real AU Core-aligned FHIR profile validation** (`validation/`) using HAPI
  FHIR's actual validation engine (`FhirInstanceValidator`) against
  hand-authored profile fixtures under `src/main/resources/au-core/` — see
  the BUILD_LOG "Judgment call" entry for what "AU Core-aligned" vs.
  "AU Core-conformant" means here.
- **The structured FHIR export endpoint** (`export/`,
  `POST /fhir/export/patient-summary`) — the business continuity capability
  from `claude/complaints-continuity-deceased.md`.
- **Mocked-but-fail-safe** Healthcare Identifiers Service (`hiservice/`), My
  Health Record (`mhr/`), and NASH signing (`nash/`) integrations — every
  mock fails closed by default (`block` mode); see each package's javadoc.

## Run locally

```bash
cd services/fhir-gateway
cp .env.example .env   # then export its values, or use your IDE's run config
mvn spring-boot:run
# -> http://localhost:3013/actuator/health
# -> http://localhost:3013/fhir/metadata                     (a real HAPI FHIR-generated CapabilityStatement)
# -> POST http://localhost:3013/fhir/export/patient-summary  (structured FHIR export — see export/dto/ for the request shape)
# -> POST http://localhost:3013/hi-service/ihi/lookup        (blocks by default; HI_SERVICE_MODE=fixture for the happy path)
# -> POST http://localhost:3013/nash/sign                    (blocks by default; NASH_MODE=fixture for the happy path)
```

## Build / test

```bash
mvn clean verify
```

> **Note for whoever runs this first**: this skeleton was generated in a sandboxed
> environment whose network policy blocked Maven Central, so `mvn clean verify` could
> not be executed there to confirm the build. Confirm it succeeds in a normal
> dev/CI environment (see `.github/workflows/ci.yml`, `fhir-gateway` job) before
> building on top of it. **Still true as of the 2026-08-13 real-implementation pass**
> (re-confirmed: Maven Central is blocked by this sandbox's egress policy) — see
> `BUILD_LOG/fhir-gateway.md`, "Known gaps outside this service's scope" #4 for what
> to double-check first if `mvn clean verify` doesn't pass cleanly.

## Docker

Unlike the Node services, this one builds from its own directory as context (no
monorepo workspace dependency to bring along):

```bash
docker build -f services/fhir-gateway/Dockerfile -t referralplatform/fhir-gateway services/fhir-gateway
```
