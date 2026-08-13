# @referralplatform/audit-client

The TS client every service imports to write to (and query/verify) the Audit Log
Service's HTTP API. See `audit-log-architecture-decision.md` and root `CONVENTIONS.md`
("Using packages/audit-client") before wiring this into a new service.

## Usage

```ts
import { AuditClient } from '@referralplatform/audit-client';
import { getServiceToken } from '@referralplatform/auth-client';

const auditClient = new AuditClient({
  baseUrl: process.env.AUDIT_LOG_SERVICE_URL!,
  getServiceToken: () => getServiceToken({ audience: 'audit-log' }),
});

await auditClient.record({
  type: 'referral.created',
  actor: { principalType: 'gp', id: gp.id, healthcareIdentifier: gp.hpiI },
  subject: { type: 'Referral', id: referral.id },
  payload: { urgent: referral.urgent },
});
```

## The outbox pattern (required for clinical/consent writes)

Don't call `record()` directly from inside a request handler that also writes the
domain row — a crash between the two writes would silently produce a clinical/consent
change with no audit trail, which `audit-log-architecture-decision.md` treats as a
structural requirement, not a nice-to-have. Instead:

1. In the same DB transaction as your domain write, insert a row into your service's
   own `AuditOutbox` table (model shape in `src/outbox.ts`).
2. A small relay loop (a NestJS `@Cron` job or a queue consumer — either is fine, see
   root CONVENTIONS.md) reads unpublished outbox rows and calls `auditClient.record()`
   for each, then marks them published.

This guarantees the write and the audit entry either both happen or neither does.

## Build / test

```bash
npm run build -w packages/audit-client
npm run test -w packages/audit-client
```
