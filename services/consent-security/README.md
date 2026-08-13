# consent-security-service

Consent & Security Service — the consent page, linked-GP management, carer re-attestation, raise-a-concern triage, deceased-patient flag/freeze workflow.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

See `BUILD_LOG/consent-security.md` for the full build write-up (design
decisions, what's mocked/interim, known gaps).

## API

All routes require a bearer token (`BearerAuthGuard`) unless noted.

| Module | Method | Path | Notes |
|---|---|---|---|
| Consent records | `POST` | `/consent-records` | Grant consent for `gp_link`, `carer_delegate`, or `sensitive_category_access`. |
| | `POST` | `/consent-records/:id/revoke` | |
| | `GET` | `/consent-records?patientId=&subjectType=` | |
| Referral visibility (per-referral, not account-wide) | `POST` | `/consent/referral-visibility` | `{ patientId, referralId, granteeId }` — `granteeId` may be `'all_linked_gps'`. |
| | `POST` | `/consent/referral-visibility/revoke` | |
| | `GET` | `/consent/referral-visibility?patientId=&referralId=` | List current grantees. |
| | `GET` | `/consent/referral-visibility/check?patientId=&referralId=&granteeId=` | Used cross-service to decide whether to show a referral. |
| Linked GPs (proxies gp-authorisation-service) | `GET` | `/consent/linked-gps?patientId=` | |
| | `POST` | `/consent/linked-gps/:id/revoke` | |
| Re-attestation scheduling | `POST` | `/reattestations` | Upsert a carer/patient schedule. |
| | `POST` | `/reattestations/:id/attest` | Resets the clock. |
| | `GET` | `/reattestations/due?asOf=` | Feed for the Notification Service to poll. |
| | `GET` | `/reattestations?patientId=` | |
| Raise a concern | `POST` | `/concerns` | Plain-language triage, not a category picker — see `src/concerns/triage.ts`. |
| | `GET` | `/concerns?patientId=&status=` | |
| | `GET` | `/concerns/:id` | |
| | `POST` | `/concerns/:id/resolve` | |
| | `POST` | `/concerns/:id/escalate-to-oaic` | Privacy/consent-breach concerns only. |
| Deceased-patient flag | `POST` | `/deceased-flags` | GP/staff/system only. |
| | `GET` | `/deceased-flags/:patientId` | |
| Access-request queue (human-reviewed) | `POST` | `/deceased-flags/:patientId/access-requests` | |
| | `GET` | `/deceased-flags/:patientId/access-requests` | Staff only. |
| | `GET` | `/access-requests/pending` | Staff only. |
| | `POST` | `/access-requests/:id/approve` | Staff only + step-up (`STEP_UP_ACR`). |
| | `POST` | `/access-requests/:id/deny` | Staff only. |
| Cross-service event polling | `GET` | `/events?type=&since=` | Interim stand-in for a real queue — see `src/events/events.service.ts`. |

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/consent-security/.env.example services/consent-security/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/consent-security
# -> http://localhost:3004/health
```

## Build

```bash
npm run build -w services/consent-security
npm run start -w services/consent-security
```

## Test

```bash
npm run test -w services/consent-security       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/consent-security   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`consent_security`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/consent-security -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
