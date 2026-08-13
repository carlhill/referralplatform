# BUILD_LOG: notification-service

2026-08-13 — initial real implementation (previously scaffold-only).

## What was built

Module #13 of `modules-and-requirements.md`: **push/SMS/email fan-out** and
**the referral-scoped secure message thread** used to resolve exceptions
(`minors-multigp-exception-paths.md`).

### 1. `src/notifications` — push/SMS/email fan-out

- **`providers/push-provider.ts`** — `PushProvider` abstract class +
  `MockPushProvider`. **MOCK — replace with real integration** (FCM/APNs or
  a unified provider like OneSignal/Expo push); no real push credentials
  exist for this build. Logs every send and returns a synthetic provider
  message id.
- **`providers/sms-provider.ts`** — `SmsProvider` abstract class +
  `MockSmsProvider`. **MOCK — replace with real integration** (Twilio,
  MessageMedia, ...); no paid SMS account exists for this build
  (`modules-and-requirements.md`: "the SMS provider is a mock ... for this
  build specifically").
- **`email.service.ts`** — **REAL** email delivery via `nodemailer` over
  SMTP. In every environment this repo's `docker-compose.yml` configures,
  that SMTP server is Mailhog (`SMTP_HOST=mailhog`, `SMTP_PORT=1025`) —
  a genuine SMTP send to a local mail-catcher, viewable at
  `http://localhost:8025`, not a mock. Includes `sendOtpEmail`/
  `sendActivationLinkEmail` convenience helpers, since this service is the
  platform's real OTP/account-activation channel per
  `modules-and-requirements.md`.
- **`notification.service.ts`** — orchestrates all three channels and
  writes one `NotificationLog` row per delivery attempt (mock or real) to a
  queryable table, per the task brief ("a queryable local table so other
  services/tests can assert on it"). `dispatch()` implements the
  exception-path design's dual-channel pattern: **push is attempted first**
  (primary, time-sensitive channel); if the recipient has no active
  registered device (or the mock provider errors), each channel in
  `fallbackChannels` (`email`, `sms`, in caller-specified order) is tried
  until one succeeds. Every attempt in one `dispatch()` call shares a
  `dispatchGroupId` so the whole fallback story is queryable as a unit.
- **`notification.controller.ts`** — `POST /notifications/{devices,push,sms,email,dispatch}`,
  `GET /notifications` (filterable list), `GET /notifications/:id`.
- **Deliberately NOT audit-logged.** Per the task brief: "not the routine
  notification delivery, which is high-volume and not audit-relevant." The
  `NotificationLog` table exists precisely so delivery is still verifiable
  by other services/tests, just not through the audit-log outbox.

### 2. `src/message-threads` — the referral-scoped secure message thread

Per `minors-multigp-exception-paths.md`: "every referral gets its own
secure, in-app conversation between the GP and patient (and specialist,
once involved) ... keeps a complete record of how an exception was
resolved, feeding straight into the same signed audit log everything else
does."

- **One thread per referral** (`MessageThread.referralId` is `@unique`),
  created lazily via `POST /referrals/:referralId/message-threads`
  (idempotent get-or-create).
- **`message-thread.service.ts`**: `createOrGet`, `postMessage`,
  `listMessages`, `addParticipant`, `resolve`. A new message on a
  `resolved` thread automatically re-opens it (a fresh exception on the
  same referral is common — documented judgment call in the class's doc
  comment). `resolve()` is idempotent (a second call is a no-op, no
  duplicate audit entry).
- **Real integration with the notification fan-out above**: posting a
  message calls `NotificationService.sendPush()` (in-process, same
  service) for every *other* participant, with
  `data: { referralId, threadId, action: 'open_message_thread' }` — the
  "deep-linking straight into that referral's message thread" pattern the
  design doc specifies. This is the one piece of real cross-feature wiring
  in this build (not a network call to another service — both features
  live in this one service, per `CONVENTIONS.md`'s directory table).
- **Every message-thread lifecycle write is audited** via the outbox
  pattern (`thread created`, `message posted`, `participant added`,
  `resolved`) — the domain write and the `AuditOutbox` row share one
  `prisma.$transaction`, exactly as `CONVENTIONS.md` §7 requires.

**Documented access-control judgment call** (see the extensive doc comment
on `MessageThreadService`): this service trusts the caller's authenticated
`ActorRef` (verified by `BearerAuthGuard`) and does not itself decide
*which* patient/GP/specialist may see a given referral's thread — that
consent/authorisation decision belongs to the Consent & Security Service
and Referral Service, which this task's scope (`services/notification`
only) doesn't include. `participants` is used to decide who gets notified
on a new message, not to hard-block posting: an actor not yet listed
auto-joins on their first post rather than being rejected, since blocking a
legitimate party from an in-progress exception conversation over a
registration race is a worse failure mode than an extra participant row.
Tightening this to a real allow-list, backed by a live consent-grant check
against Consent & Security, is a documented follow-up.

### 3. `src/audit-outbox` — the outbox pattern

Same real, both-halves implementation already established in
`services/onboarding-account` (`AuditOutboxService.enqueue`/`enqueueStandalone`
+ `AuditOutboxRelayService`'s `@Interval(5000)` polling relay with
`attempts`/`lastError` tracking, `MAX_ATTEMPTS = 8`, never dropping a row).
Only message-thread events go through it, per the task brief's carve-out
for routine notification delivery.

**Judgment call — local `NotificationAuditEventType` extension.**
`packages/shared-types`' `AuditEventType` union has zero event types for
the message thread. Per that file's own doc comment the fix is additive,
but `packages/shared-types` is outside this agent's scope
(`services/notification` only) — so, following the exact precedent already
set in `services/onboarding-account/src/common/audit/onboarding-audit-events.ts`,
this service defines its own `NotificationAuditEventType` union
(`message_thread.created` / `.message_posted` / `.participant_added` /
`.resolved`) in `src/common/audit/notification-audit-events.ts` and casts
at the call site via `asAuditEventType()`. Safe at runtime (the Audit Log
Service accepts `type` as an opaque string); only widens what the
*compiler* accepts. Shared-types maintainer should fold these in later.

## Verifying real Mailhog SMTP delivery

The task brief requires proof this "genuinely sends through Mailhog and is
visible in Mailhog's web UI." **This sandbox's egress policy blocks pulling
the `mailhog/mailhog` image from Docker Hub or GHCR (403 Forbidden on both
registries)** — the same class of restriction documented elsewhere in this
repo for `binaries.prisma.sh` (confirmed: `docker pull mailhog/mailhog`
→ 403; `docker pull ghcr.io/mailhog/mailhog` → 403). Docker itself works in
this sandbox (the daemon just needed starting) — it's specifically image
pulls from public registries that are blocked.

To still genuinely verify the SMTP code path (not just unit-test it with a
mocked `nodemailer.createTransport`), I stood up a minimal real TCP SMTP
listener (RFC 5321 happy-path subset: `EHLO`/`MAIL FROM`/`RCPT TO`/`DATA`/
`QUIT`) and ran the *exact* `nodemailer.createTransport({ host, port,
secure: false })` + `sendMail(...)` call `EmailService` makes against it —
this is the same wire protocol Mailhog's SMTP listener speaks on port 1025.
Both `sendOtpEmail`-shaped and `sendActivationLinkEmail`-shaped messages
were sent and received in full (correct `From`/`To`/`Subject`,
multipart/alternative text+HTML MIME body, real `Message-ID`), proving the
actual SMTP conversation nodemailer performs succeeds end-to-end — the only
untested-in-this-sandbox variable is Mailhog's own listener implementation,
which is a widely-used, standard SMTP server. In a normal environment
(`docker compose up -d mailhog`), this is a genuine send, verifiable at
`http://localhost:8025`, with no code change required.

## Known gaps / incomplete

- **`npm run build` / `npm run typecheck` / `npm run test:e2e` fail in this
  sandbox** — the exact same pre-existing, sandbox-wide limitation already
  documented in `BUILD_LOG/referral.md` and `BUILD_LOG/onboarding-account.md`:
  `prisma generate` needs `binaries.prisma.sh` (blocked, 403), so the
  repo's hoisted `node_modules/.prisma/client` is whichever service's
  schema last generated it successfully before the egress block (currently
  `onboarding-account`'s), and every *other* service's real Prisma-model
  code (this one included) fails to typecheck against it. **Verified this
  is not something newly broken by this build**: `npm run typecheck -w
  services/referral` fails identically against its own real models,
  `npm run typecheck -w services/onboarding-account` passes (it's the one
  whose schema is currently hoisted). Resolves itself the moment
  `npm run prisma:migrate -w services/notification -- --name init` runs
  with real network access to `binaries.prisma.sh`.
- **`npm run test` (unit) passes fully — 39/39** — every real business-logic
  test (`NotificationService`, `MessageThreadService`, `EmailService`,
  both mock providers, both audit-outbox pieces) runs against a hand-rolled
  fake Prisma object (see each `*.spec.ts`'s doc comment), the same
  workaround pattern `services/referral` and `services/onboarding-account`
  already established, bypassing the generated-client problem entirely.
  `npm run lint -w services/notification` is clean.
- **No real access-control enforcement on who may read/post to a given
  referral's message thread** — see `MessageThreadService`'s doc comment
  above; this service trusts the caller's `ActorRef` and the caller
  (typically a portal/app backend-for-frontend) is expected to have already
  checked consent via Consent & Security / Referral Service before letting
  a user open a thread.
- **`dispatch()`'s fallback is single-recipient, not the "dual
  notification" (both patient AND GP) pattern** described in
  `minors-multigp-exception-paths.md` for referral-decline/cancellation
  events — that pattern is "call `dispatch()` twice, once per recipient,"
  which is the *calling* service's (Referral Service's) job, not this
  one's. This service provides the primitive; it doesn't itself know a
  referral has two interested parties.
- **No push notification is sent when a participant is merely *added* to a
  thread** (only on new messages) — a reasonable scope cut given time, not
  a design decision to revisit first.

## How to run/test this service in isolation

```bash
cp services/notification/.env.example services/notification/.env

# Unit tests — run against a hand-rolled fake Prisma, no real DB/network needed:
npm run test -w services/notification
npm run lint -w services/notification

# Full stack (needs a real Postgres/Keycloak/Mailhog and, once network access
# to binaries.prisma.sh is available, a real `prisma generate`/`migrate`):
docker compose up -d postgres redis keycloak mailhog
npm run prisma:migrate -w services/notification -- --name init
npm run start:dev -w services/notification
# -> http://localhost:3010/health
# -> http://localhost:8025 (Mailhog web UI) to read real OTP/activation emails
```

See `services/notification/README.md` for the full endpoint list.
