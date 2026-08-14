# Local build fixes (getting `docker compose up` to actually work)

This repo was handed off having never been built or booted end-to-end (see `HANDOFF.md`) — the sandbox that produced it had no real network access, so nothing here had ever been through a real compiler, a real `npm install`, or a real Keycloak import. Everything below is a genuine, previously-undiscovered bug found by actually running the build for the first time, on 2026-08-14. Recorded here so the same class of bug isn't rediscovered from scratch in a service that hasn't been reached yet.

## Environment-level (fix once, applies to everything)

- **Missing `.dockerignore`** at repo root meant every Node service's build context included the full `node_modules` (1.2GB) and `.git` — added a root `.dockerignore` excluding `node_modules`, `.git`, `dist`, `.next`, `build`, `coverage`, `e2e`, `.claude`, `BUILD_LOG`, `*.md`.
- **TLS-inspecting antivirus (AVG on this machine)** breaks Maven's and Node's default trust store, causing `certificate_unknown`/`UNABLE_TO_VERIFY_LEAF_SIGNATURE` errors on any registry fetch inside a container. Fix: export the interception root CA, drop it at `certs/local-ca.pem` (gitignored) at repo root and in `services/fhir-gateway/certs/`, and trust it via `NODE_EXTRA_CA_CERTS` (Node) / a `keytool -importcert` step (Java/Maven) in each Dockerfile. Silently no-ops on a machine without this proxy.
- **npm 10.8.x has a known "Exit handler never called!" crash** on large workspace installs (see npm/cli#7639, #8407, #8572, #8974). Every Node Dockerfile now does `npm install -g npm@11 && npm install --workspaces ...` before anything else.

## Prisma

- **`prisma`/`@prisma/client` were pinned to `^7.9.1`**, but every service's `schema.prisma` used the pre-v7 `datasource { url = env(...) }` syntax that Prisma 7 removed (now requires `prisma.config.ts` + an adapter). Pinned all 12 Prisma-using services back to `^6.19.0` (last v6) rather than rewriting every schema for v7's new config model.
- **6 of 12 Prisma-using services' Dockerfiles were missing the `RUN npm run prisma:generate -w services/<name>` step entirely** (admin-console, booking, identity-access, notification, onboarding-account, specialist-review) — their `PrismaClient` had zero generated models, causing `Property 'auditOutbox' is missing in type 'PrismaService'`-style errors. Compare `grep -l prisma:generate package.json` vs the Dockerfile before assuming a service is fine.

## TypeScript ↔ Prisma bridge-interface bugs (repeated across ~10 files)

Several services hand-roll a minimal "transaction client" interface (e.g. `TxClient`, `RootPrismaClient`) instead of importing Prisma's real generated transaction type, to keep `$transaction(async (tx) => ...)` callbacks lightly typed. Two distinct, both-real mistakes recurred:

1. **Bridge methods typed `(args: unknown) => Promise<X>`.** TypeScript's contravariant parameter checking means a function that only accepts `unknown` can never be structurally satisfied by Prisma's real (narrower) generated methods. Fix: use `(args: any) => Promise<X>` instead — this is a deliberate duck-typing bridge, so `any` is correct here, not a shortcut.
2. **The bridge interface declared its own `$transaction` field self-referentially** (`interface TxClient { $transaction: (fn: (tx: TxClient) => ...) => ... }`). Prisma's real transaction-callback argument type explicitly *omits* `$transaction` (no nested transactions) — a self-referential declaration can never be satisfied. **But** some files use a valid two-tier version of the same pattern (`RootPrismaClient extends TxClient` with `$transaction`'s callback typed as the narrower `TxClient`, not `RootPrismaClient` itself) — that pattern is correct and must be *kept*. Check whether the callback's type parameter matches the *enclosing* interface's own name (bad, remove) or a separate, narrower interface (fine, keep) before touching this — a blanket regex fix broke 3 valid files here the first time.

A few one-off Prisma JSON-field casts were also needed (`Record<string, unknown>` isn't automatically assignable to Prisma's `InputJsonValue`) — cast `as any` at the call site, e.g. `services/admin-console/src/verification-cases/verification-cases.service.ts`, `services/notification/src/notifications/notification.service.ts`.

## Java / fhir-gateway

- `docker-compose.yml`'s `fhir-gateway` build had `context: services/fhir-gateway` with `dockerfile: services/fhir-gateway/Dockerfile` — since the dockerfile path is relative to context, this resolved to a nonexistent nested path. Fixed to `dockerfile: Dockerfile`.
- `DefaultProfileValidationSupport` was imported from `org.hl7.fhir.common.hapi.validation.support` — it actually lives in `ca.uhn.fhir.context.support` for HAPI FHIR 7.4.0.
- `CapabilityStatement.setFormat(List.of("json"))` — `setFormat` expects `List<CodeType>`, not `List<String>`. Use `.addFormat("json")` (HAPI's generated `add*` convenience wrapper) instead.
- `@LocalServerPort` moved from `org.springframework.boot.web.server` to `org.springframework.boot.test.web.server` in this Spring Boot version.

## Keycloak realm import (`infra/keycloak/realm-export.json`)

Keycloak has no standalone realm-JSON validator — the only validation is the real import at container startup, and it's **sequential/fail-fast**: it stops at the first bad field and won't reveal the next one until that's fixed. Found so far, in the order they surfaced:

1. **Fake "comment" fields** (`_webAuthnPolicyComment`, `_directAccessGrantsComment`, etc. — 18 total) used to leave inline documentation in a format that doesn't support comments. Keycloak's Jackson deserializer rejects unknown fields outright. Stripped all `"_*Comment": "..."` fields.
2. **`hideOnLoginPage` isn't a real property** on `IdentityProviderRepresentation` — the actual field is `hideOnLogin` (Keycloak's own error message usefully lists all valid properties when this happens).
3. **Two `authenticationFlows[].description` values exceeded 255 characters** — Keycloak persists these into a real `VARCHAR(255)` column; long prose descriptions belong in the docs, not inline. Truncated to a short summary + doc pointer.
4. **The realm's `sslRequired: "external"` rejected the mock-myID identity provider's plain-`http://` internal URLs** (`authorization_url`/`token_url`/etc. pointing at `http://identity-access:3001/mock-myid/...`) at import time. Since this file is explicitly local-dev-only, changed to `sslRequired: "none"`.
5. **Keycloak 26 serves `/health/ready` on a separate management port (9000), not the main port (8080).** The `docker-compose.yml` healthcheck was hitting 8080 and always 404ing even when Keycloak was genuinely healthy — confirmed by manually running the exact healthcheck command via `docker exec` against both ports. Fixed to port 9000. **Resolved** — realm imports cleanly and the container reaches a healthy state.

Before touching another realm-adjacent config, it's worth writing a small script that checks the whole file at once for known constraint classes (no `_*` unknown fields, no string >255 chars in description-like fields, no `http://` in IdP URL fields) rather than discovering them one restart at a time — the description-length and comment-field sweeps above were done this way after the first hit of each; should have been done proactively from the start. Keycloak ships no standalone realm-JSON validator — the only real validation is the actual import at container startup, and it fails sequentially (fixing error #1 only reveals error #2 on the next attempt).

## immudb healthcheck — resolved (with a caveat)

`codenotary/immudb:1.9.5` is a genuinely minimal image — no shell, no `nc`, no `ls`, nothing beyond the `immudb` binary itself (confirmed via `docker exec ... sh` and `docker exec ... nc` both failing with "executable file not found"). The original healthcheck (`CMD nc -z localhost 3322`) could never succeed in this image regardless of whether immudb itself was actually healthy — genuinely a false-negative every time, not a real problem being reported. `immudb --help` also has no `status`/`healthcheck` subcommand.

Fixed to `test: ['CMD', '/usr/sbin/immudb', 'version']` — but be honest about what this actually checks: it only confirms the binary can still execute inside the container, **not** that the gRPC listener on 3322 is actually accepting connections. It's a liveness signal, not a true readiness probe. In practice immudb's own startup log shows it becomes ready in ~1 second reliably, so this gap is low-risk for local dev, but don't assume "healthy" here means "definitely accepting connections" if something immudb-dependent (audit-log) still fails to connect — check immudb's actual logs directly in that case rather than trusting this healthcheck.

## Host port scheme (Carl's request, 2026-08-14)

Every service's **host-exposed** port (left side of `HOST:CONTAINER` in `docker-compose.yml`) was remapped to a clean sequential range starting at 20000, specifically to avoid colliding with whatever else might already be using the "normal" default ports (5432, 6379, the 3000-range, etc.) on a dev machine. Container-internal ports are untouched — service-to-service traffic on the Docker network still uses each service's normal port via its DNS name (`postgres:5432`, `audit-log:3012`, etc.); only what's reachable from the host machine changed. Full mapping is now in `docker-compose.yml`'s own header comment — treat that as the source of truth, not this file, since it's what's actually enforced.

This also required updating every `localhost:<old-port>` reference elsewhere in the compose file (CORS allow-lists like `ACCOUNT_LINK_ALLOWED_ORIGINS`, and every frontend's `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` browser-facing service URLs) — those are host-facing too, not just the `ports:` mapping lines themselves. **Still outstanding**: `README.md`'s own port table (if it documents specific port numbers) and any hardcoded ports in `e2e/` test config likely also need the same update — not yet checked/fixed as of this writing.

## immudb Node SDK — root cause found and fixed

The `audit-log` service crashed shortly after boot with `Error: 2 UNKNOWN: please login` from `immudb-node`'s `listDatabases()` call, even though `services/audit-log/src/immudb/immudb.service.ts` clearly calls `login()` before `listDatabases()`. Root cause, found by testing the exact SDK call sequence directly against the running immudb container (`docker compose run --rm --entrypoint node audit-log -e "..."`) rather than guessing from server-side logs:

`ImmudbClient.getInstance({ host, port })` — as called in this codebase — defaults `autoLogin: true, autoDatabase: true` internally. With those defaults on, `getInstance()` runs its **own internal** login+listDatabases sequence using `IMMUDB_USER`/`IMMUDB_PWD` env vars — not the `IMMUDB_USERNAME`/`IMMUDB_PASSWORD` ones this service actually sets. Since those are unset, the internal auto-login is silently skipped, but the internal auto-`listDatabases()` still runs anyway — unauthenticated — and throws, **before the service's own explicit `login()` call three lines later ever gets a chance to run.** The class's own doc comment already said it intended to skip this auto-behavior and do it manually; the actual `getInstance()` call was just missing the flags that turn it off.

Fix: pass `autoLogin: false, autoDatabase: false` explicitly in the `getInstance()` config. Verified directly (a standalone reproduction script showed `login()` and `listDatabases()` both succeeding cleanly with the flags set) before touching `audit-log`'s Dockerfile/rebuild — same discipline as everything else here: prove it once, cheaply, before spending a full rebuild cycle on it.

Two things ruled out along the way, in case they come up again: `IMMUDB_AUTH=false` on the server makes it *worse* (`listDatabases` is admin-scoped and explicitly requires auth to be on — the error changes to "this command is available only with authentication on"), and there is no actively maintained alternative Node SDK to upgrade to — `immudb-node@1.1.1` (npm, used here) and `@codenotary/immudb-node@1.0.4`/`2.0.0-alpha.1` (a different, differently-scoped package) are all several years stale; none is a real upgrade path.

## First service fully proven end-to-end: `audit-log`

Confirmed 2026-08-14: image builds clean, container stays up (`docker compose ps` → healthy), `GET /health` responds `{"status":"ok",...}`, `npx prisma migrate deploy` applied its one migration with no errors, and real tables (`audit_event_index`, `_prisma_migrations`) now exist in the `audit_log` Postgres schema. This is the reference "what done looks like" for every other service still to be verified.

## Docker build-context caching (Carl's request, 2026-08-14)

Every Node Dockerfile did `COPY . .` (the whole monorepo) **before** `npm install`. That means Docker's layer cache treats "any file changed anywhere in the repo" as "npm install's inputs changed" — so a one-line source edit in a completely unrelated service forces a full ~8-minute `npm install --workspaces` re-run, even though install only actually depends on `package.json`/`package-lock.json`. Measured directly: an `audit-log` rebuild after only editing `immudb.service.ts` (no dependency change at all) still spent 489 seconds in the install step.

Fix (see `CONVENTIONS.md` §9 for the canonical pattern): copy only the root `package.json`/`package-lock.json` plus each of *this service's own* dependency workspaces' `package.json` files (not the whole monorepo) before `npm install`, then `COPY . .` for the actual source *after* install. npm's workspace glob (`services/*`, `apps/*`, `packages/*` in the root `package.json`) resolves against whatever's actually present on disk at install time, so partial-workspace copying is safe — it doesn't error on the workspaces that aren't there yet. Applied first to `services/identity-access/Dockerfile` and verified with a real build before rolling out to the remaining services (same one-then-batch discipline as every other fix here).

## Missing Prisma migrations (2 services)

`notification` and `specialist-review` shipped with **empty** `prisma/migrations` folders — every other Prisma-using service has a real initial migration checked in, these two never had one generated at all. `prisma migrate deploy` silently reports "No pending migrations to apply" rather than erroring, so this doesn't block a service from starting — it just means the service's Postgres schema has zero tables until someone notices and runs `prisma migrate dev --name init` against a live, connected container. Fixed for both `notification` (migration `20260814114110_init`) and `specialist-review` (migration `20260814122918_init`) — same recipe each time: `docker compose exec <service> sh -c "cd services/<service> && npx prisma migrate dev --name init"` then `docker cp <container>:/workspace/services/<service>/prisma/migrations services/<service>/prisma/` to persist it back into the repo, since it only exists in the container's writable layer otherwise.

## fhir-gateway — missing HAPI FHIR cache provider dependency

First actual boot of the Java service crashed with `HAPI-2200: No Cache Service Providers found`. `AuCoreProfileValidationService.init()` constructs a HAPI `CachingValidationSupport`, which requires a cache provider (`hapi-fhir-caching-caffeine` or `-guava`) on the classpath — `pom.xml` declared `hapi-fhir-validation` etc. but never the caching provider itself. Added `hapi-fhir-caching-caffeine` (HAPI's own documented default). Confirmed healthy after rebuild — `GET /actuator/health` responds normally, first working boot of this service.

## Keycloak User Profile silently drops `principal_type` on API-created users

Found while creating a test `internal_staff` user to exercise `admin-console`'s practice-onboarding flow. `packages/auth-client`'s token verifier reads a custom `principal_type` claim off the JWT (`services/identity-access` etc. rely on it for every authorization check). Realm-imported users (like the seeded `gp.test`) have it correctly — but a user created via Keycloak's Admin API (`POST /admin/realms/.../users`) silently drops any `attributes.principal_type` sent in the request body, no error, 201 success either way. Root cause: Keycloak 26's declarative User Profile didn't declare `principal_type` as a known attribute, so the User Profile validator strips anything it doesn't recognize on write.

This is currently **latent, not yet actually triggered** — no code path in this repo creates Keycloak users programmatically yet (that's the existing, already-known "no Keycloak user provisioned on account activation" gap). But it would have silently broken authorization for every user created that way once that feature is built — a new user would always fall back to `principal_type: 'system'` (the auth-client's default when the claim is missing), failing every `requireStaff`/role-specific check with a confusing 403 rather than an obviously-wrong-looking error.

Fixed by adding `principal_type` to the realm's User Profile config (`PUT /admin/realms/referralplatform/users/profile`, appending an attribute entry with `edit: ["admin"]` permission) — needs to be added to `realm-export.json` itself (as a `"attributes"` block under the realm's `userProfile`/component config, not just patched live) so it survives a fresh realm import; not yet done as of this writing since it was found via live testing, not applied back to the source file.

## Missing audience mappers — no cross-service authenticated call ever worked

Found while actually testing the golden path with real data (not just health checks). Creating a practice-onboarding case via `admin-console` with a real `gp-portal`-issued user token returned `401 Invalid or expired token` even with a correct, unexpired, correctly-signed token.

Root cause: `packages/auth-client`'s `TokenVerifier` validates `aud` strictly against each backend service's own `KEYCLOAK_CLIENT_ID` (e.g. `admin-console` requires `aud` to include `"admin-console-service"`). But Keycloak only puts a client's own audience-relevant entries in `aud` if an explicit **audience protocol mapper** exists — by default a user token's `aud` is just `["account"]`, regardless of which client requested it. **`realm-export.json` had zero audience mappers anywhere.** This means *every* authenticated frontend→backend call (the entire golden path, and the real GP/specialist/patient portals in general) would have failed with this same 401, not just this specific test — a previously-undiscovered, blocking, systemic gap only found by actually exercising an authenticated write endpoint, not by health checks or `tsc`.

Fix: added a shared client scope `backend-services-audience` (13 `oidc-audience-mapper` entries, one per backend service's client id, including `fhir-gateway-service`) as a `defaultClientScope` on all 4 frontend clients (`gp-portal`, `specialist-portal`, `patient-web`, `patient-mobile`). Verified live (a `gp.test`-issued token's `aud` now lists all 13 backend service ids) before persisting into `realm-export.json`'s new top-level `clientScopes` array + each frontend client's `defaultClientScopes`, so it survives a fresh realm import, not just live in the currently-running instance.

**Same gap also broke service-to-service calls** — found next, while testing the actual golden path: `onboarding-account`'s `AuditOutboxRelayService` (relaying its outbox to `audit-log`) failed with 401 on every attempt. Its client-credentials service-account token had the identical `aud: ["account"]` default. Applied the same `backend-services-audience` scope as a `defaultClientScope` to all 13 backend confidential clients too (not just the 4 frontends) — every service calls at least one other service (the audit outbox pattern alone means all 13 call `audit-log`), so this was equally load-bearing. Persisted the same way into `realm-export.json`.

Also found and fixed while setting up test users: Keycloak 26's declarative **User Profile silently drops unrecognized attributes** (like `principal_type`) on users created via the Admin API — see the separate note above. Needed `PUT /admin/realms/referralplatform/users/profile` to declare `principal_type` as a permitted attribute before a test `internal_staff` user's attribute would actually persist.

## Next steps / where this left off

Working through services one at a time, end-to-end (build → container up → health check passing), per Carl's explicit instruction — not full-stack rebuilds. Order so far: infra (postgres, redis, immudb, keycloak) → `audit-log` (first app service, chosen because it has no app-level dependencies, only infra) — **done, fully verified**. Also rolling the Docker build-caching fix out across all Node Dockerfiles (see above) since it benefits every remaining service's build speed. Next: pick the next service (one with real app-level dependencies, to prove that pattern too) and repeat the same full verification.
