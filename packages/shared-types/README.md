# @referralplatform/shared-types

Shared TypeScript types for ReferralPlatform's core domain objects: `Patient`, `Carer`,
`GPLink`, `Referral`, `ComplianceFlag`, `DirectoryEntry`, `Booking`, `FollowUpPlan`,
`AuditEvent`, `ConsentRecord`, `Concern`.

Every service and app that reads or writes one of these entities imports its shape from
here rather than redeclaring it. This is what keeps ~15 independently-built services
speaking the same data model. See root `CONVENTIONS.md` ("Shared types") for the rule.

## Usage

```ts
import { Referral, ReferralStatus } from '@referralplatform/shared-types';
```

## Build

```bash
npm run build -w packages/shared-types
```

## Changing a type

These types are shared across every workspace. Treat a breaking change (renaming or
removing a field) as a cross-team change: grep the monorepo for usages before merging,
and prefer additive/optional fields where possible.
