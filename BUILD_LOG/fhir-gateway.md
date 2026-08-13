# BUILD_LOG: fhir-gateway

2026-08-13 — initial real implementation (previously scaffold-only: a bare
Spring Boot app + one `/fhir/metadata` capability-statement endpoint).

## What was built

- **Genuine AU Core-aligned FHIR profile validation**
  (`validation/AuCoreProfileValidationService.java`) — real HAPI FHIR
  validation machinery (`FhirInstanceValidator` + `PrePopulatedValidationSupport`
  + `DefaultProfileValidationSupport` + `InMemoryTerminologyServerValidationSupport`
  + `CommonCodeSystemsTerminologyService`, wrapped in a `CachingValidationSupport`
  chain), not mocked. Loads StructureDefinition profiles from
  `src/main/resources/au-core/*.json` at startup and validates any resource
  against whatever profile it declares in `meta.profile`. See "Judgment call"
  below for exactly what is and isn't the official AU Core IG here.
- **Structured FHIR export endpoint** (`export/`) —
  `POST /fhir/export/patient-summary`, the business continuity requirement
  from `claude/complaints-continuity-deceased.md` section 2 ("A structured
  export capability (FHIR-formatted...) should be built as a platform
  feature in its own right"). Takes a patient + their referral history +
  Follow-up Plans + an audit-log summary (already fetched by the caller —
  this gateway has no Postgres store of its own) and returns a real FHIR
  `Bundle` (type `collection`) containing:
  - `Patient` (AU Core-aligned profile)
  - `ServiceRequest` per referral (AU Core-aligned profile — this is the
    "referral document" the build brief asks for)
  - `CarePlan` per Follow-up Plan, `basedOn` the originating `ServiceRequest`
  - `AuditEvent` per audit-summary entry (FHIR's own resource for exactly
    this purpose), carrying the `immudbTxId` through as a custom extension
    so a recipient retains the pointer needed to independently re-verify
    tamper-evidence against the source Audit Log Service later
  - The Bundle is validated before being returned; a failure returns
    `422 Unprocessable Entity` with a real FHIR `OperationOutcome`, not a
    generic error shape.
- **Three mocked-but-fail-safe government integrations**, each behind a
  clean interface with a `Mock*` implementation, per the build brief's
  explicit requirement ("fail safely — block the dependent action with a
  clear error — rather than silently proceeding without a verified
  identifier"):
  - `hiservice/` — `HealthcareIdentifiersService` (IHI/HPI-O/HPI-I lookups).
    `MockHealthcareIdentifiersService` **MOCK — replace with a real
    Services Australia HI Service B2B/SOAP integration.**
  - `mhr/` — `MyHealthRecordService` (read/write documents).
    `MockMyHealthRecordService` **MOCK — replace with a real NASH-authenticated
    MHR National Infrastructure connection.**
  - `nash/` — `NashSigningService` (sign/verify). `MockNashSigningService`
    **MOCK — replace with a real HSM-backed NASH organisation certificate.**

  Each has two modes (`referralplatform.<x>.mode`, env `HI_SERVICE_MODE` /
  `MHR_MODE` / `NASH_MODE`, default **`block`**): `block` throws a typed
  checked exception on every call ("no real credentials configured, blocking
  the dependent action" — this is the production-safe default and the one
  that actually satisfies the requirement); `fixture` returns/operates on a
  small, obviously-fake, hardcoded dataset (NASH fixture mode signs with a
  local ephemeral Ed25519 test keypair explicitly tagged
  `Ed25519-TEST-FIXTURE-NOT-NASH` in its output) purely so downstream logic
  and this service's own tests can exercise the "found"/"signed" path
  deterministically without ever pretending to be the real government
  service. `GlobalExceptionHandler` (`common/`) maps all three exception
  types to `424 Failed Dependency` (or `404` for a genuine not-found), never
  a silent 200.
- **Real HTTP integration with the Audit Log Service** (`audit/`) — since
  this service is Java, it can't import `packages/audit-client`
  (TypeScript), so `AuditLogClient` re-implements the same wire contract
  (`POST {AUDIT_LOG_SERVICE_URL}/audit-events`) directly against
  `services/audit-log`'s real controller, using `ServiceTokenProvider` (a
  Java re-implementation of `packages/auth-client`'s Keycloak
  client-credentials flow) for the bearer token. See "Known gaps" below —
  this is currently a best-effort, non-blocking write, not a full outbox
  pattern, and the specific event type it sends isn't registered yet.
- **AU Core profile fixtures** (`src/main/resources/au-core/*.json`) — three
  hand-authored `StructureDefinition` resources (`au-core-patient`,
  `au-core-servicerequest`, `au-core-practitioner`) registered under the
  real AU Core canonical URLs (`http://hl7.org.au/fhir/core/StructureDefinition/...`).
- **Test proving a referral validates against an AU Core profile**
  (`validation/AuCoreProfileValidationServiceTest.java`,
  `referralServiceRequestPassesAuCoreAlignedProfile` /
  `referralServiceRequestMissingRequiredFieldsFailsValidation`) — the
  specific proof the build brief asked for, using the real HAPI FHIR
  validator, not a hand-rolled assertion.
- Shared a single `FhirContext` bean (`config/FhirContextConfig.java`)
  across the app instead of the scaffold's per-class instantiation
  (`FhirCapabilityController` now takes it via constructor injection) —
  HAPI FHIR's own docs are explicit that `FhirContext` is expensive to
  build and meant to be a long-lived singleton.

## Key decisions

1. **Judgment call — AU Core profile source.** The build brief asked for
   "AU Core profile validation using HAPI FHIR's libraries." The *official*
   AU Core IG is distributed as an npm-style FHIR package
   (`hl7.fhir.au.core`) via the FHIR package registry — downloading it
   requires network access this sandbox's egress policy blocks (confirmed:
   `mvn dependency:go-offline` against Maven Central itself also returns a
   policy-denial 403 through the sandbox's egress proxy — see
   `curl "$HTTPS_PROXY/__agentproxy/status"`, `recentRelayFailures` — this
   is the same constraint the scaffold phase already documented in this
   service's own README/pom.xml for `mvn clean verify`). Rather than fake
   or skip AU Core validation entirely, I hand-authored three minimal
   `StructureDefinition` profiles reproducing the *key cardinality
   constraints* of the real AU Core Patient/ServiceRequest/Practitioner
   profiles, registered under their **real canonical URLs**. The
   *validation engine and mechanism* (`FhirInstanceValidator` resolving a
   resource's declared `meta.profile` against a `PrePopulatedValidationSupport`
   chain) is completely real, unmodified HAPI FHIR — this is the actual
   documented recipe for custom/IG profile validation with HAPI FHIR, not a
   simplification of the mechanism. What's simplified is the profile
   *content*: no slicing (e.g. the real AU Core Patient profile slices
   `identifier` to require an IHI-system slice specifically; mine checks
   "at least one identifier with a system and value" only), no terminology
   bindings, no `must-support` flags. Every profile JSON file's own
   `description` field states this explicitly. **To move from
   "AU Core-aligned" to "AU Core-conformant"**: replace the files under
   `src/main/resources/au-core/` with the real downloaded IG package's
   `StructureDefinition` resources (fetch `hl7.fhir.au.core` from
   `packages.fhir.org` from an environment with real network access) — no
   other code changes needed, since `AuCoreProfileValidationService` loads
   whatever `.json` files it finds there by canonical URL.
2. **Fail-safe over fail-silent for hiservice/mhr/nash, best-effort for
   audit.** The build brief is explicit that identifier/signing/MHR
   integrations must "fail safely (block the dependent action with a clear
   error) rather than silently proceeding" — implemented literally: the
   default mode always throws. The one deliberate exception is
   `AuditLogClient.recordBestEffort()`, which never throws even on failure.
   Reasoning: an unlogged audit event is a lesser harm than blocking a
   business-continuity export because of a gap in the audit event type
   registry (see gap #1 below) that's outside this service's control — and
   audit logging failing shouldn't cascade into "the platform can't produce
   a continuity export," which would be a worse outcome for the exact
   scenario this endpoint exists for.
3. **fhir-gateway has no outbox table.** Root CONVENTIONS.md §7 mandates the
   outbox pattern (domain write + outbox row in one DB transaction) for
   every clinical/consent-relevant write. This service is the one service
   with no Postgres schema of its own (CONVENTIONS.md §5), so there's no
   transactional boundary to put an outbox row in. `AuditLogClient` is a
   direct best-effort call instead — a real, documented divergence from the
   platform-wide pattern, not an oversight. If this becomes a real
   correctness problem in practice, the fix is giving fhir-gateway its own
   thin Postgres schema for an outbox table + a small relay, matching every
   other service — not inventing a different pattern.
4. **DTOs, not shared-types.** `packages/shared-types` is a TypeScript npm
   workspace package; this service deliberately has no npm/monorepo
   dependency (CONVENTIONS.md §3, §9). `export/dto/*.java` are hand-written
   Java records mirroring the relevant fields of `Patient`, `Referral`,
   `FollowUpPlan`, and `AuditEvent` from `packages/shared-types/src/*.ts` —
   documented per-field in each DTO's javadoc pointing back at the source
   type. **If a shared type's shape changes, these DTOs need a matching
   manual update** — there's no compiler to catch drift across the
   language boundary, unlike within the TS workspace.
5. **ServiceRequest (not a custom Composition) represents a referral.**
   FHIR's standard resource for a clinical request/order is `ServiceRequest`
   — used here rather than inventing a bespoke "Referral" profile, and
   consistent with AU Core's own approach (AU Core profiles `ServiceRequest`
   for referral/order use cases).

## What's mocked (clearly labelled in code, not hidden)

- `hiservice/MockHealthcareIdentifiersService.java` — Healthcare
  Identifiers Service (IHI/HPI-O/HPI-I). No Services Australia B2B
  credentials or NASH cert exist in this build. Default `block` mode always
  fails closed; `fixture` mode resolves two hardcoded, clearly-fake
  demographic/identifier pairs for local dev/testing.
- `mhr/MockMyHealthRecordService.java` — My Health Record read/write. No
  NASH-authenticated MHR National Infrastructure connection exists. Default
  `block` mode always fails closed; `fixture` mode returns/accepts
  fabricated document data.
- `nash/MockNashSigningService.java` — NASH-backed signing. No HSM-backed
  NASH organisation certificate exists. Default `block` mode always fails
  closed; `fixture` mode signs with a local, ephemeral (regenerated every
  process start, never persisted), explicitly-tagged test keypair — never
  claims to be a real NASH signature.
- `src/main/resources/au-core/*.json` — hand-authored minimal AU Core
  profile reproductions, not the official downloaded IG package. See
  judgment call #1 above.

## Known gaps outside this service's scope

Per this task's boundary (only `services/fhir-gateway`, no git commands, no
edits outside this directory), the following would need a coordinated
change elsewhere in the monorepo and are deliberately left as documented
gaps rather than worked around:

1. **New audit event type needed.** `AuditLogClient` sends
   `type: "fhir.export.performed"` after a successful export, but this
   isn't in `packages/shared-types/src/audit-event.ts`'s `AuditEventType`
   union or `services/audit-log/src/audit-events/dto/create-audit-event.dto.ts`'s
   matching `AUDIT_EVENT_TYPES` runtime list — both outside this scope
   directory. Until that lands, the Audit Log Service will reject the call
   with `400`, which `AuditLogClient` treats as a non-fatal, logged
   warning (see key decision #2) — the export itself still succeeds.
2. **No `fhir-gateway-service` Keycloak client yet.** `infra/keycloak/realm-export.json`
   defines a `<name>-service` confidential client for every other backend
   service but not `fhir-gateway-service` — needed for `ServiceTokenProvider`'s
   client-credentials grant to actually succeed against a real Keycloak.
3. **`docker-compose.yml`'s `fhir-gateway` service block doesn't pass
   `AUDIT_LOG_SERVICE_URL` / `KEYCLOAK_ISSUER` / `KEYCLOAK_CLIENT_ID` /
   `KEYCLOAK_CLIENT_SECRET`** into the container yet (every other service's
   block does, via the `node-service-env` YAML anchor, which — being
   Node-specific — this service doesn't use). `application.yml`'s defaults
   (`http://audit-log:3012`, `http://keycloak:8080/realms/referralplatform`,
   client id `fhir-gateway-service`, secret `change-me-in-local-env`)
   already match the values every other service's compose block uses, so
   adding an explicit `environment:` block here is a small, low-risk
   follow-up once gap #2 is also resolved.
4. **`mvn clean verify` still not run against Maven Central in any sandbox
   this service has been built in** — confirmed again this session
   (`mvn dependency:go-offline` → 403 policy denial via the agent egress
   proxy on `repo.maven.apache.org`, same constraint the scaffold phase
   documented). All new code was written and manually re-checked
   line-by-line against the real HAPI FHIR 7.4.x / Spring Boot 3.3.x /
   Spring Framework 6.1.x (`RestClient`) APIs from first principles, but it
   has **not** been compiled or executed in this environment. **This is the
   single most important thing for whoever picks this up next to do**: run
   `mvn clean verify` in a normal dev/CI environment before relying on this
   build. Areas most worth a close look if something doesn't compile:
   - `hapi-fhir-validation`'s exact package names for
     `PrePopulatedValidationSupport` / `ValidationSupportChain` /
     `DefaultProfileValidationSupport` / `CachingValidationSupport` /
     `InMemoryTerminologyServerValidationSupport` /
     `CommonCodeSystemsTerminologyService` / `FhirInstanceValidator`
     (`org.hl7.fhir.common.hapi.validation.support.*` /
     `org.hl7.fhir.common.hapi.validation.validator.*`) — these moved
     packages across HAPI FHIR major versions historically.
   - `org.hl7.fhir.r4.model.AuditEvent`/`CarePlan`/`ServiceRequest`'s exact
     nested-enum and backbone-component class/method names in
     `export/FhirExportMappingService.java`.
   - `RestClient`/`RestClient.Builder` autoconfiguration in
     `audit/ServiceTokenProvider.java` and `audit/AuditLogClient.java`
     (requires Spring Boot 3.2+, present in `spring-boot-starter-web` —
     already a pom.xml dependency, no new one added for this).

## How to run/test this service in isolation

```bash
cd services/fhir-gateway
cp .env.example .env   # then export its values, or use your IDE's run config
mvn spring-boot:run
# -> http://localhost:3013/actuator/health
# -> http://localhost:3013/fhir/metadata                    (existing capability statement)
# -> POST http://localhost:3013/fhir/export/patient-summary (new — see export/dto/ for the request shape)
# -> POST http://localhost:3013/hi-service/ihi/lookup        (blocks by default — HI_SERVICE_MODE=fixture to try the happy path)
# -> POST http://localhost:3013/nash/sign                    (blocks by default — NASH_MODE=fixture to try the happy path)

mvn clean verify   # NOT executed in this sandbox — see "Known gaps" #4. Run this for real before trusting the build.
```

Example export request body (`POST /fhir/export/patient-summary`):

```json
{
  "patient": {"id": "patient-1", "ihi": "8003608833357361", "givenName": "Jane", "familyName": "Citizen", "dateOfBirth": "1985-04-12"},
  "referrals": [{"id": "referral-1", "status": "completed", "urgent": false, "reasonForReferral": "Chronic knee pain", "gpId": "gp-1", "gpDisplayName": "Dr Fixture Test GP", "createdAt": "2026-06-01T09:00:00Z"}],
  "followUpPlans": [{"id": "plan-1", "referralId": "referral-1", "status": "active", "nextReviewDueAt": "2026-12-01T09:00:00Z", "requiredTests": ["Repeat X-ray"]}],
  "auditSummary": [{"id": "audit-1", "type": "referral.created", "actorPrincipalType": "gp", "subjectType": "Referral", "subjectId": "referral-1", "occurredAt": "2026-06-01T09:00:00Z"}]
}
```

### Tests added (not yet executed — see gap #4)

- `validation/AuCoreProfileValidationServiceTest.java` — 5 tests: a valid
  referral `ServiceRequest` and a valid `Patient` each pass AU Core-aligned
  validation; each also fails when a required field is missing.
- `export/FhirExportControllerTest.java` — full-stack MockMvc test: a
  complete patient summary export returns `200` with a validated FHIR
  `Bundle`; a request failing bean validation returns `400`.
- `hiservice/MockHealthcareIdentifiersServiceTest.java` — 4 tests: block
  mode always throws `SERVICE_NOT_CONNECTED` for IHI/HPI-O/HPI-I; fixture
  mode resolves known fixtures and reports `NOT_FOUND` for unknown ones.
- `nash/MockNashSigningServiceTest.java` — 4 tests: block mode always
  throws for sign/verify; fixture mode signs+verifies a round trip and
  correctly fails verification against tampered content.
- `audit/AuditLogClientTest.java` — 2 tests: `recordBestEffort` never
  throws, whether disabled or pointed at an unreachable host.
- Pre-existing `FhirGatewayApplicationTests.java` (context loads, `/actuator/health`,
  `/fhir/metadata`) left as-is and should still pass — no breaking changes
  to what it already exercised.
