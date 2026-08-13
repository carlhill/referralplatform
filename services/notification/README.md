# notification-service

Notification Service — push/SMS/email fan-out and the referral-scoped secure message thread. SMS is mocked; OTP/account-activation email is real for local dev.

See `claude/modules-and-requirements.md` (project doc) for this service's full
functional/non-functional requirements, and root `CONVENTIONS.md` for the
patterns every service follows (this service is stamped from that template —
structure, scripts, and file layout are identical across all 12 services).

## Run locally

```bash
# from the monorepo root (installs every workspace at once):
npm install

cp services/notification/.env.example services/notification/.env
# then start the local infra this service needs (Postgres, Redis, Keycloak, Mailhog):
docker compose up -d postgres redis keycloak mailhog

npm run start:dev -w services/notification
# -> http://localhost:3010/health
# -> http://localhost:8025 to read real emails this service sends via Mailhog
```

## API

All routes below require `Authorization: Bearer <token>` (any authenticated
principal — see `src/common/bearer-auth.guard.ts`).

**Push/SMS/email fan-out** (`src/notifications`):

- `POST /notifications/devices` — register a push device token
- `POST /notifications/push` — send push to every active device for a recipient (MOCK provider)
- `POST /notifications/sms` — send SMS (MOCK provider)
- `POST /notifications/email` — send REAL email via SMTP (Mailhog locally)
- `POST /notifications/dispatch` — push primary, `fallbackChannels: ['email','sms']` fallback if push has no device/fails
- `GET /notifications?recipientId=...&channel=...&status=...` — query the delivery log
- `GET /notifications/:id` — one delivery log row

**Referral-scoped secure message thread** (`src/message-threads`):

- `POST /referrals/:referralId/message-threads` — get-or-create the referral's thread
- `GET /referrals/:referralId/message-threads` — 0 or 1 thread for this referral
- `GET /message-threads/:id` — thread + participants + messages
- `POST /message-threads/:id/messages` — post a message (push-notifies other participants)
- `GET /message-threads/:id/messages` — list messages
- `POST /message-threads/:id/participants` — add a known party (e.g. specialist joins)
- `POST /message-threads/:id/resolve` — mark the exception resolved

## Build

```bash
npm run build -w services/notification
npm run start -w services/notification
```

## Test

```bash
npm run test -w services/notification       # unit tests (src/**/*.spec.ts)
npm run test:e2e -w services/notification   # e2e tests (test/**/*.e2e-spec.ts)
```

## Database

Prisma against this service's own schema (`notification`) in the shared Postgres
instance — see `prisma/schema.prisma` and `.env.example`. First migration:

```bash
npm run prisma:migrate -w services/notification -- --name init
```

## Docker

Built from the monorepo root context — see `Dockerfile` and root `docker-compose.yml`.
