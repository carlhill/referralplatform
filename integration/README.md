# Integration tests

Tests that run against the **real running docker-compose stack** over its
**host-published ports** — the same path a browser takes.

```bash
docker compose up -d postgres redis immudb keycloak mailhog audit-log identity-access referral
npm run test:integration
```

## Why this tier exists

Every serious bug found on 2026-08-17 was invisible to the unit suite and to health
checks, and each one was caught only by running something for real:

| Bug | Why unit tests could not catch it |
| --- | --- |
| Keycloak issuer mismatch — every browser-originated call 401'd | Server-side tokens matched the expected issuer; only a token minted over the *host* port differed. Unit tests use fakes; the golden-path testing fetched tokens server-side. |
| Audit trail recorded nothing (4 stacked bugs) | `verifiedSet`/`verifiedGet` were mocked. The real immudb version gap, the database-name rule, and the base64 decode bug only appear against a live server. |
| 35 event types rejected with 400 | Producers and the consumer were tested separately, each with its own idea of a valid type. |
| Every service reported `unhealthy` | Healthchecks only run in Docker. Nothing in the unit suite executes a `HEALTHCHECK`. |
| Clinician login structurally impossible | Keycloak's flow-selection behaviour lives in Keycloak, not in our code. |

The common shape: **each of these lived in a seam between components**, and the unit
suite tests components. 577 unit tests were green throughout.

## What is asserted

- `auth-issuer.int-spec.ts` — a token minted the way a browser gets one carries the
  expected issuer and audience, **is accepted** by a backend, and an unauthenticated
  call is still rejected (so the pass is not just an open endpoint).
- `audit-trail.int-spec.ts` — an event is accepted, signed, anchored in immudb, and
  verifies as intact on both the immudb proof and the NASH signature; an invented event
  type is rejected; the event types producers actually emit are accepted.
- `realm-and-health.int-spec.ts` — no container reports `unhealthy`; the clinician flow
  offers both a passkey and a bootstrap branch; `Cookie` stays an ALTERNATIVE sibling;
  frontend redirect URIs match the current ports; `principal_type` is declared; SMTP is
  configured.

## Conventions

**Fail loudly when the stack is down.** `requireStack()` throws with the command to
start it. A tier that silently skips reports green while testing nothing, which is worse
than not having it.

**Assert against the host ports.** Talking to services over the Docker network would
have hidden the issuer bug completely — that asymmetry *was* the bug.

**Write the regression, not the feature.** Each test names the incident it guards. When
one fails, the comment tells you what broke and why it mattered.

## Verified to actually catch regressions

Not just written to pass. Re-running `referral` in its pre-fix configuration (without
`KEYCLOAK_PUBLIC_ISSUER`) makes the suite fail with `Expected: not 401` — the exact
assertion written for that bug — and it returns to green once the fix is restored.

## Not covered

Browser/UI behaviour (see `e2e/` for Playwright, never run), `fhir-gateway`'s Maven
tests, and the full golden path across all services — this tier runs against whichever
services are up, and asserts on the seams most likely to break silently.
