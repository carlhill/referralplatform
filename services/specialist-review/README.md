# specialist-review-service

Specialist Review Service — AI-assisted structured extraction for specialists, eConsult-style async advice, pre-visit pathology/imaging requests.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/specialist-review/.env.example services/specialist-review/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, ...):
docker compose up -d postgres redis keycloak

npm run start:dev -w services/specialist-review
# -> http://localhost:3008/health
```

## Build

```bash
npm run build -w services/specialist-review
npm run start -w services/specialist-review
```

## Test

```bash
npm run test -w services/specialist-review       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/specialist-review   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`specialist_review`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/specialist-review -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.

## What this service does

Module #10/#5 (business-process-flow.md module 5 "Specialist review"): once a
referral is ready for specialist review, this service (1) runs an
AI-assisted structured extraction over the referral letter, producing a
review-only summary, (2) only after the specialist explicitly confirms that
summary, lets them record the eConsult-vs-full-appointment branch decision,
and (3) lets them request pre-visit pathology/imaging. See
`BUILD_LOG/specialist-review.md` for the full design rationale, including
the Babylon Health cautionary guardrail this service is built around.

### API (all routes under `BearerAuthGuard`; see `src/cases/cases.controller.ts`)

| Method & path | Who | What |
|---|---|---|
| `POST /cases` | system / internal_staff / specialist | Ingest a referral packet for review |
| `GET /cases`, `GET /cases/:id` | any authenticated | List/read cases |
| `POST /cases/:id/extract` | specialist / internal_staff | Run the configured ExtractionProvider — produces a `pending_review` summary only |
| `GET /cases/:id/extractions` | any authenticated | List extraction runs |
| `POST /cases/:id/extractions/:extractionId/confirm` | specialist / internal_staff | **The explicit-confirmation gate** — required before any downstream action |
| `POST /cases/:id/extractions/:extractionId/reject` | specialist / internal_staff | Reject an unusable extraction run |
| `POST /cases/:id/branch-decision` | specialist / internal_staff | eConsult vs. full-appointment (requires a confirmed extraction) |
| `GET /cases/:id/decisions` | any authenticated | List branch decisions |
| `POST /cases/:id/pathology-requests` | specialist / internal_staff | Pre-visit pathology/imaging request (requires a confirmed extraction) |
| `GET /cases/:id/pathology-requests` | any authenticated | List pathology/imaging requests |
| `POST /cases/:id/complete` | specialist / internal_staff | Close out the case (requires a branch decision) |
| `POST /cases/:id/cancel` | patient/carer/gp/specialist/internal_staff | Cancel a case |

### The pluggable ExtractionProvider

`src/extraction/extraction-provider.interface.ts` defines `ExtractionProvider`.
Two implementations are registered, selected via `EXTRACTION_PROVIDER` in
`.env` (`rule_based` default, or `llm`):

- `RuleBasedExtractionProvider` (`src/extraction/rule-based-extraction.provider.ts`)
  — the real, working default: regex/heuristic extraction of patient,
  reason, key history, medications, and referring GP from free text.
- `LlmExtractionProvider` (`src/extraction/llm-extraction.provider.ts`) —
  **MOCK — replace with real integration**. Shows the real shape of an
  OpenAI-compatible LLM call, but falls back to the rule-based provider
  (logged loudly) unless a real `LLM_API_KEY` is configured — no such key
  exists in this build.

### What's mocked

- `MockPathologyOrderingProvider` (`src/cases/pathology-ordering.provider.ts`)
  — pre-visit pathology/imaging e-ordering. Real integration needs a
  HealthLink/Medical-Objects secure-messaging-vendor account this build
  doesn't have.
- `LlmExtractionProvider` as above.
