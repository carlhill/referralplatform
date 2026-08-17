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

## Postgres host port 20000 — stale `wslrelay.exe` silently killing every connection (2026-08-15)

Found while trying to connect to the local Postgres instance from `psql` and pgAdmin on the Windows host (not from inside a container — `docker exec ... psql` worked fine the whole time, which is what made this confusing at first). Both host clients failed identically: `server closed the connection unexpectedly`, immediately after the TCP handshake succeeded. Ruled out, in order, before finding the real cause: AVG antivirus (added file exceptions for both `psql.exe` and `pgAdmin4.exe`, no change; checked AVG's Enhanced Firewall app rules — both already had wide-open `ALLOW ALL IN/OUT` rules; checked AVG's Network Inspector — that shield is just Wi-Fi/device scanning, unrelated), general Docker/WSL2 networking (ruled out because HTTP requests to other host-mapped ports, e.g. `identity-access` on 20007, worked fine at the same time).

Root cause, found via `Get-NetTCPConnection -LocalPort 20000`: **two separate processes** were listening on port 20000 — `com.docker.backend.exe` (the real listener, correctly forwarding into the `postgres` container) and a second, orphaned `wslrelay.exe` bound specifically to the loopback interface (`::1`). Since `localhost`/`127.0.0.1` connections from Windows route over loopback, they were landing on the dead `wslrelay.exe` listener — which accepted the TCP handshake (so `Test-NetConnection` reported success) but had no real backend behind it, so it just closed the connection as soon as any actual protocol data was sent. This is the same category of stale-WSL-process issue already documented above under "Windows/WSL2 memory management" (duplicate `VmmemWSL` processes) — just manifesting as a duplicate port listener instead of duplicate memory usage.

Fix applied: killed the orphaned `wslrelay.exe` process (`Stop-Process -Id <pid> -Force`), then moved Postgres's host-exposed port from `20000` to `20025` in `docker-compose.yml` (recreated just the `postgres` container, not a full-stack rebuild) so a future recurrence of the same stale-relay pattern on 20000 specifically doesn't silently break database access again. Verified with `psql -h 127.0.0.1 -p 20025 ...` and pgAdmin, both connecting cleanly post-fix. See `CONVENTIONS.md` §9's pre-flight checklist for the port-conflict check this prompted.

## GP/specialist portal login session — 2026-08-15 evening

Started from Carl reporting `gp-portal` login was broken after the port-remap work above. Found and fixed **five distinct, real bugs**, then hit a **sixth, still-unresolved issue** that is a genuine browser/OS-level WebAuthn quirk rather than a platform bug. Session stopped here for the night — resume with "Still open" below.

### Fixed

1. **`gp-portal`'s Dockerfile never wired `NEXT_PUBLIC_*` build args.** Next.js inlines these into the client bundle at `next build` time, not at container start — `docker-compose.yml`'s `environment:` block only affects the *running* container, which is too late. The Dockerfile had zero `ARG`/`ENV` lines for them, so every browser call silently used the hardcoded fallback defaults in `apps/gp-portal/lib/api/config.ts` — including the **pre-port-remap** Keycloak/app URLs (port 8180, 3100), which is why sign-in redirected to dead ports long after `docker-compose.yml` itself had been updated to the 20000+ range. Fixed by adding explicit `ARG`/`ENV` lines to `apps/gp-portal/Dockerfile` and a matching `build.args` block in `docker-compose.yml`, rebuilt, verified the redirect URL was correct. **Not yet applied to `specialist-portal`/`patient-web`** — same fix needed there, same root cause almost certainly present.

2. **`realm-export.json`'s 4 frontend clients had stale pre-remap `redirectUris`/`webOrigins`** (`3100`/`3101`/`3102`/`8081`). Fixed in the file, and live via Admin API since Keycloak's import is skip-if-realm-exists (see below).

3. **The entire realm was missing its standard OIDC client scopes** (`profile`, `email`, `roles`, `web-origins`, `acr`, `basic`, plus optional `address`/`phone`/`microprofile-jwt`) — only `backend-services-audience` and the built-in `offline_access` existed. Root cause: when the earlier audience-mapper fix (see above) added a custom top-level `clientScopes` array to `realm-export.json`, Keycloak's importer treats an explicit `clientScopes` list as authoritative and skips auto-creating its normal built-ins. This was latent since that edit landed and only surfaced tonight because a genuinely fresh import finally happened. Fixed by fetching Keycloak's own default scope definitions from a disposable throwaway realm (guarantees byte-accurate protocol mappers) and merging them into `realm-export.json`'s `clientScopes` array — now byte-identical to what a real fresh Keycloak realm would have. **Watch for**: nested `protocolMappers[].id` fields collide with the source realm's primary keys if copied verbatim — must strip `id` recursively (top-level *and* nested), not just on the outer object, or creation 409s.

4. **The `clinician-browser` authentication flow's WebAuthn execution referenced a typo'd provider ID**: `webauthn-passwordless-authenticator` instead of Keycloak's real `webauthn-authenticator-passwordless` (word order swapped). This crashed with `RuntimeException: Unable to find factory for AuthenticatorFactory` and surfaced to the user as "Unexpected error when handling authentication request to identity provider." Fixed in both `realm-export.json` (2 occurrences) and live.

5. **`KC_DB: dev-file` has no persistent volume in `docker-compose.yml`** — Keycloak's entire realm state (not just container data, but literally every Admin-API-created object) lived in the container's ephemeral filesystem. This meant *any* container recreate (not just `docker compose down`) silently discarded everything created live — test users, the scope fixes above, rotated client secrets — reverting to whatever's checked into `realm-export.json`. This burned significant time mid-session: fixes applied live would vanish on the next incidental recreate (e.g. one needed just to change a log-level env var), looking like the fix "didn't take" when it actually just got wiped. **Fixed**: added `keycloak-data:/opt/keycloak/data` volume + registered `keycloak-data` in the top-level `volumes:` block. Also fixed as a side effect: all 13 backend services' `KEYCLOAK_CLIENT_SECRET` (`change-me-in-local-env`) were *already correctly declared* in `realm-export.json`'s client definitions the whole time — the earlier `invalid_client_credentials` storm was purely a symptom of #3/#5 forcing repeated non-persistent realm recreates, not a separate secret-mismatch bug.

### Also fixed, unrelated to Keycloak

- **Docker's port-forward proxy occasionally accepts TCP but returns zero bytes** (`ERR_EMPTY_RESPONSE`/`curl: Empty reply from server`) for a host-mapped port even when the container itself is completely healthy and the port has only one clean listener (ruling out the `wslrelay.exe` duplicate-listener pattern documented above). Hit this on both `keycloak` (20004) and `mailhog` (20006) tonight, each after other churn (WSL shutdown, container recreates) nearby. Fix each time was `docker compose up -d --force-recreate <service>` to force Docker to re-register the port mapping cleanly — same remedy as the Postgres port-20000 issue, different underlying trigger. **Caveat**: recreating `mailhog` wipes its in-memory message store (no persistence), so any email sent before the recreate is lost — had to resend after fixing.
- **Keycloak's realm has no SMTP server configured at all** (`smtpServer: {}` in a fresh export) — its own `execute-actions-email` (required-action emails, used tonight to bootstrap a passkey registration) had nowhere to send. Fixed **live only** by pointing it at `mailhog:1025` — **not yet persisted to `realm-export.json`**, so this will be lost on the next fresh import. Needs a `smtpServer` block added to the realm JSON tomorrow.
- **WebAuthn ceremonies fail with `SecurityError: This is an invalid domain.`** if any part of the flow (the link clicked, the page navigated to) uses `127.0.0.1` while the rest of the flow uses `localhost` — WebAuthn treats these as completely different origins even though they're the same machine. Cost real time tonight: an `execute-actions-email` link generated by hitting Keycloak's Admin API via `127.0.0.1` produced a token whose embedded issuer/audience were `127.0.0.1`-based, breaking registration until regenerated by hitting the Admin API via `localhost` instead. **Convention going forward: always use `localhost`, never `127.0.0.1`, for anything that touches a WebAuthn ceremony** (registration or authentication) — fine to use `127.0.0.1` for plain HTTP/API testing (Postgres, service health checks, etc.).

### Still open — resume here tomorrow

**`gp-portal` login is still not usable end-to-end.** Root cause of the *original* symptom (fixed): the `clinician-browser Forms` flow has `auth-username-form` (REQUIRED) immediately before `webauthn-authenticator-passwordless` (REQUIRED, `userSetupAllowed: true`). Per Keycloak's actual source (`AuthenticationSelectionResolver.createAuthenticationSelectionList`, verified by fetching the real v26.0.8 file from GitHub, not from memory), once a user is resolved via the username step, the WebAuthn execution is only *selectable at all* if that user's credential-manager already lists a matching credential type — there is no "prompt to register inline" fallback for a bare `REQUIRED` execution with zero existing credentials, regardless of `userSetupAllowed`. WebAuthn Passwordless is actually designed to resolve the user itself via discoverable/resident keys with *no* prior username step — the flow's structure as authored is fundamentally incompatible with a brand-new clinician who has never registered a passkey. **This would also block real production clinician onboarding**, not just local testing — worth flagging to the design docs, not only fixing as a local-dev workaround.

Worked around tonight (not a permanent fix) via Keycloak's `execute-actions-email` mechanism (now that SMTP → Mailhog works) to send `gp.test` a magic link landing directly on the `webauthn-register-passwordless` required-action page, bypassing the broken inline path. **Registration itself succeeded** in Edge via Windows' native passkey UI (saved to Microsoft Password Manager) — confirmed server-side (`type="CUSTOM_REQUIRED_ACTION"` success, no more `EXECUTE_ACTION_TOKEN_ERROR`). But the *subsequent authentication* attempt fails: Windows' security-key picker only offers "insert a USB security key," with no visible option to select the just-created synced passkey, and a retry after using "Save another way" during a second registration attempt produced `Failed to authenticate by the Passkey` outright. This looks like a Windows/Edge WebAuthn transport-hint mismatch (the credential's stored `transports` not matching what the authentication `allowCredentials` request expects) rather than anything Keycloak- or platform-config-related, but wasn't root-caused — ran out of productive avenues for tonight (tried both Edge's native UI and hadn't yet successfully retried Chrome's DevTools virtual authenticator against this *specific* re-registered credential).

**Concrete next steps for tomorrow, roughly in order of promise:**
1. ~~Retry authentication using the Chrome incognito window with the DevTools virtual authenticator~~ — **DONE, this worked.** See "First successful GP Portal browser login" below for the exact recipe.
2. ~~Check/clean `gp.test`'s stored WebAuthn credentials~~ — **DONE**, deleting the stale ones was part of what unblocked it.
2a. **NEW AND NOW THE TOP PRIORITY: the Keycloak issuer mismatch** (see its own section below) — every browser-originated backend call 401s. This blocks all real UI use and outranks everything else on this list.
3. Independently of the login UX: **fix the flow structure itself** so a brand-new clinician can actually get in without pre-existing Admin/Mailhog intervention — likely by removing `auth-username-form` from ahead of the WebAuthn step in `clinician-browser Forms` (and the equivalent in `patient-carer-browser`, which has the identical structural pattern) so WebAuthn Passwordless can resolve the user itself via discoverable credentials, matching Keycloak's actual designed usage pattern. This is a real product/security-design fix, not just a local-dev one — worth a deliberate look at `identity-security-recommendations.md` section 6 before changing it, since the flow was presumably authored to match specific requirements there.
4. Apply the `NEXT_PUBLIC_*` build-arg fix (#1 above) to `specialist-portal` and `patient-web` too — not yet done, same root cause almost certainly present.
5. Add the missing `smtpServer` block to `realm-export.json` (currently live-only, will be lost on next fresh import).
6. `KC_LOG_LEVEL: 'info,org.keycloak.authentication:debug'` is still set in `docker-compose.yml` from tonight's debugging — fine to leave for continued troubleshooting tomorrow, but revert once this is resolved (it's noisy and not appropriate for normal use).
7. Still outstanding from earlier tonight, never returned to: several containers were showing `unhealthy` (`directory`, `audit-log`, `followup-recall`, `specialist-review`, `consent-security`, `referral`, `gp-authorisation`) — worth a fresh check, since several container recreates happened since that was last observed and the underlying cause was never diagnosed.

## Keycloak issuer mismatch — no browser-originated backend call has ever worked (2026-08-17)

**This is the most significant bug found so far, and it was only findable by actually driving the UI.** Found immediately after the first-ever successful GP Portal browser login (see below).

Every GP Portal page *renders*, but every page that reads or writes backend data fails with "Invalid or expired token". Root cause:

- Keycloak has no `KC_HOSTNAME` set, so it builds the `iss` claim from **whatever host the token request arrived on**.
- The **browser** obtains tokens via the host-published port → `iss = http://localhost:20004/realms/referralplatform`.
- Every backend service validates with `KEYCLOAK_ISSUER = http://keycloak:8080/realms/referralplatform` (the Docker-internal name) — see `docker-compose.yml` and each service's `src/common/clients.ts`.
- `packages/auth-client`'s `TokenVerifier` passes that value straight to `jose`'s `jwtVerify({ issuer })`, which is an **exact string comparison** → every browser token is rejected.

Proven by A/B test on one endpoint (`GET /referrals?gpId=…` on `referral-service`), same user and password, differing only in where the token was minted:

| token minted via | `iss` | result |
| --- | --- | --- |
| `localhost:20004` (browser path) | `http://localhost:20004/realms/referralplatform` | **401** |
| `keycloak:8080` (inside the Docker network) | `http://keycloak:8080/realms/referralplatform` | **200** |

**Why this was never caught before**: all prior golden-path testing obtained tokens server-side or from inside the Docker network, where `iss` happened to match. Health checks don't exercise authenticated endpoints at all. So "all 21 services verified healthy + golden path passes" was true *and* the entire browser→backend path was still completely broken — a good reminder that service-level verification is not the same as user-level verification.

**User-visible scope** (GP Portal, confirmed): `Referrals` and `Messages` fail on page load; `Follow-up & recall` fails its data call (its "No Follow-up Plans found" empty state masks the error rather than surfacing it — arguably its own small bug). `Patients`, `New referral`, `Practice settings` and `Deceased-patient flag` render their forms fine but every one of them POSTs to a backend, so all would fail on submit. Only `Home` is genuinely unaffected. The same fault applies to `specialist-portal` and `patient-web`, which have not been tested but share the identical mechanism.

**Two candidate fixes — not yet applied, pick one deliberately:**

- **(A) Split the issuer from the internal endpoints (production-shaped, recommended).** Set `KC_HOSTNAME: http://localhost:20004` on Keycloak so it stamps one stable issuer on *every* token regardless of the request host (this also fixes service-to-service tokens, which would otherwise start failing the moment the expected issuer changes). Then have backends validate `issuer = http://localhost:20004/realms/referralplatform` while still reaching Keycloak internally: `TokenVerifier` **already supports a `jwksUri` override** (`packages/auth-client/src/token-verifier.ts:10,36`) so JWKS can stay on `http://keycloak:8080/...`. Note `ServiceTokenProvider` (`service-token.ts:35`) also derives its *token* endpoint from `issuer`, so it needs its own internal URL rather than sharing `KEYCLOAK_ISSUER` — that env var is currently doing three different jobs (issuer to validate, JWKS to fetch, token endpoint to call) and needs splitting. Touches `docker-compose.yml` plus `src/common/clients.ts` in all 13 backend services. Mechanical but wide, and needs 13 image rebuilds — do it when there's time and RAM headroom, not at the end of a session.
- **(B) Make one hostname resolve identically on both sides (fast unblock, machine-specific).** Add `127.0.0.1 keycloak` to the Windows hosts file, publish Keycloak as `8080:8080`, and point the frontends' `NEXT_PUBLIC_KEYCLOAK_ISSUER` at `http://keycloak:8080/realms/referralplatform`. Then browser and containers agree on the issuer with **zero backend code change** — only the frontends rebuild. Downside: requires an admin hosts-file edit and is not how a real deployment would look, so it's a local-dev shortcut rather than the real fix.

## First successful GP Portal browser login (2026-08-17)

Resolved the passkey blocker from the previous session. What actually worked, after several dead ends:

1. Delete all of `gp.test`'s existing `webauthn-passwordless` credentials via `DELETE /admin/realms/referralplatform/users/{id}/credentials/{credId}` — repeated half-finished attempts had left several, and a picker offering multiple stale credentials was part of the confusion.
2. `PUT .../execute-actions-email?client_id=gp-portal&redirect_uri=http://localhost:20020/callback` with body `["webauthn-register-passwordless"]` to send a registration magic-link via Mailhog (needs the live SMTP config — see the still-unpersisted `smtpServer` note above).
3. **Critical**: Chrome DevTools' WebAuthn virtual authenticator is **per-tab**, and Mailhog's link opens a *new* tab. Every earlier failure was the ceremony falling through to the real OS passkey manager (Microsoft Password Manager in Edge, Google Password Manager in Chrome) because the new tab had no virtual authenticator armed. The fix is to open DevTools → WebAuthn → enable virtual environment → Add authenticator (`ctap2` / `internal` / resident keys / user verification) **in the tab that will run the ceremony**, and to keep exactly **one** authenticator listed (two caused registration and authentication to target different ones).
4. Register, confirm a credential row appears with `RP ID = localhost`, then navigate the **same tab** to `localhost:20020` and sign in. Watch the credential's **signature count increment** — that is the reliable signal the virtual authenticator (not the OS) is servicing the assertion.

Also note: `localhost` and `127.0.0.1` are **different WebAuthn origins**. Keep every step of a ceremony on `localhost` — an action-token link generated by hitting the Admin API via `127.0.0.1` embeds a `127.0.0.1` issuer and fails registration with `SecurityError: This is an invalid domain.`

**Small residual app bug**: after a successful login the `/callback` page can show "Missing authorization code, state, or PKCE verifier — start sign-in again" even though sign-in *succeeded* (nav shows the signed-in user). Keycloak logs `error="already_logged_in"` with `redirected_to_client="true"` — a duplicate authorization request left over from the required-action redirect chain gets bounced back to `/callback` without a `code`. `gp-portal`'s callback handler should recognise `error=already_logged_in` and redirect home instead of showing a misleading "start sign-in again".

## Next steps / where this left off

Working through services one at a time, end-to-end (build → container up → health check passing), per Carl's explicit instruction — not full-stack rebuilds. Order so far: infra (postgres, redis, immudb, keycloak) → `audit-log` (first app service, chosen because it has no app-level dependencies, only infra) — **done, fully verified**. Also rolling the Docker build-caching fix out across all Node Dockerfiles (see above) since it benefits every remaining service's build speed. Next: pick the next service (one with real app-level dependencies, to prove that pattern too) and repeat the same full verification.

## The audit trail: four stacked bugs, now fixed end-to-end (2026-08-17)

Starting state: `audit_log.audit_event_index` had **0 rows** while five services held
24 unrelayed entries in their outboxes. Fixing it took four independent bugs, each
hidden behind the previous one — worth reading as a sequence, because each one only
became visible once the one before it was cleared.

**1. immudb server/client version gap.** Every `verifiedSet` failed instantly with
`verifiedSet dual verification failed` — the client's Merkle-proof check rejecting the
server's response on every write from a cold start. `immudb-node@1.1.1` is from 2021
(its release notes say "Update schema to version 1.1.0 of immudb") and was talking to
a far newer server. Fixed by pinning `codenotary/immudb:1.1.0` to match the client.
There is no maintained Node SDK to upgrade to instead — every candidate is years
stale — so pinning the server is the practical option.

**2. Database-name validation.** With the older server, startup then failed on
`punctuation marks and symbols are not allowed in database name`: immudb 1.1.0 rejects
underscores, and the service asked for `audit_log`. Renamed to `auditlog` via
`IMMUDB_DATABASE` (env-only, no rebuild). Newer immudb allows underscores, which is
why this had never been hit.

**3. `verifiedGet` corrupted its own read — and reported it as tamper detection.**
Writes now worked, but `POST /audit-events/:id/verify` returned `valid: false` with
`immudbProofValid: false`, on entries that were completely intact. `ImmudbService.verifiedGet`
did `Buffer.from(entry.value, 'base64')`, on the documented assumption that the SDK
base64-encodes `value`. It does not — proven by calling `verifiedGet` directly against
the live server inside the container, which returns `typeof value === 'string'` holding
the exact JSON envelope. Base64-decoding already-plain text produced garbage,
`JSON.parse` threw, and a bare `catch {}` in `AuditEventsService.verify` turned that
into `immudbProofValid: false`.

That is the most dangerous bug of the four: **a decode error was indistinguishable
from tamper detection**, on the one code path whose entire job is to tell you whether
your audit trail has been altered — and it logged nothing at all. The `catch` now logs
the reason. A failed proof and a failed decode are very different incidents and must
never collapse into the same silent boolean.

**4. Event types rejected by the consumer.** With verification fixed, `onboarding-account`'s
outbox still would not drain: `lastError` showed `Audit Log Service returned 400`. Ten
event types the producers deliberately emit (`account.otp.sent`,
`account.activation.identity_verified`, `gp_practice.hpio_verified`,
`practice_onboarding_case.opened`, …) were absent from both
`packages/shared-types`' `AuditEventType` union and audit-log's runtime
`AUDIT_EVENT_TYPES` whitelist — exactly the drift that file's own header comment warns
about. Added to both. Note this means real consent- and identity-relevant actions
(OTP issuance/verification, HPI-O verification) were never being recorded at all.

**Plus one operational trap.** Once all four were fixed the rows *still* did not
relay: they had already hit `MAX_ATTEMPTS = 8` while the bugs were live, and the relay
query filters `attempts: { lt: MAX_ATTEMPTS }`, so it skipped them permanently. They
only moved after a manual `UPDATE ... SET attempts = 0`. See TODO.md items 1a/1b —
there is no supported way to requeue dead-lettered audit rows, which sits badly beside
the relay's own comment that nothing should ever be discarded.

**Verified**: `audit_event_index` 0 → 19 rows; `onboarding_account` outbox 12 pending →
0; a freshly-relayed `account.otp.*` event returns `valid: true` with both
`immudbProofValid` and `nashSignatureValid` true.

**Also fixed in passing**: `audit-log` spells its environment out explicitly instead of
merging the `x-node-service-env` anchor, so it never inherited `KEYCLOAK_PUBLIC_ISSUER`
from the issuer fix and 401'd every inbound call. Any service with a hand-written env
block needs that variable repeated — `fhir-gateway` is the other one, though it does
not currently validate inbound JWTs.

## Clinician login flow — enrolment dead-end and two ignored executions (2026-08-17)

**The dead end.** `clinician-browser Forms` ran `auth-username-form` (REQUIRED) then
`webauthn-authenticator-passwordless` (REQUIRED). Per Keycloak's
`AuthenticationSelectionResolver`, once the username step resolves a user the WebAuthn
execution is only *selectable* if that user already holds a matching credential —
`userSetupAllowed: true` does not create an inline "register one now" path. So every
clinician who had never enrolled a passkey hit `Cannot login, credential setup
required`, with no way forward. That is a production onboarding defect: it is not
possible to onboard a GP or specialist through the product at all.

Restructured to `auth-username-form` (REQUIRED) → new `clinician-browser Credential`
sub-flow (REQUIRED) containing `webauthn-authenticator-passwordless` (ALTERNATIVE) and
`auth-password-form` (ALTERNATIVE). Keycloak only offers a branch the user actually has
a credential for, so this yields passkey-only for enrolled clinicians and a password
bootstrap for new ones, without a `NOT configured` condition (which Keycloak's flow
model can't express).

Verified by driving the real login endpoint with PKCE for both users:

- `gp.test` (passkey enrolled, password deleted) → **passkey prompt only**
- `specialist.test` (bootstrap password, no passkey) → **password form**, and after
  submitting it, the **Passkey Registration** required-action page

**The security requirement is preserved by provisioning, not by the flow.**
`identity-security-recommendations.md` §6 requires passkey/hardware key to be mandatory
for clinicians (AAL2/AAL3). What actually enforces that here is an enrolled clinician
having **no password credential** — while `gp.test` still had one, the probe showed the
password form being offered *instead of* the passkey, i.e. a silent drop to AAL1.
Deleting the password produced the correct passkey-only prompt. So the rule
"bootstrap password is issued once, then removed on enrolment" is load-bearing and is
currently enforced by nothing at all — see TODO 2a.

**Two executions were being silently ignored.** Both `clinician-browser` and
`patient-carer-browser` had their `Forms` sub-flow as REQUIRED while `Cookie` (and, in
the patient flow, `Identity Provider Redirector`) sat beside it as ALTERNATIVE.
Keycloak logs `REQUIRED and ALTERNATIVE elements at same level! Those alternative
executions will be ignored: [auth-cookie]` on every login — it had been in the logs all
session and was easy to read past. Consequences: **SSO cookie re-authentication never
worked** (every navigation forced a full re-auth, which is also why the duplicate
`already_logged_in` callback kept appearing), and in the patient flow **the mock-myID
identity-provider redirector could never fire**, so the TDIF path was unreachable
regardless of how it was configured. Both `Forms` sub-flows are now ALTERNATIVE
siblings, matching Keycloak's own stock browser flow shape. The warning no longer
appears.

## Enforcing passkey-only clinicians, and a second silent audit-drop (2026-08-17)

Follow-on from the clinician login fix. That fix left the AAL2/AAL3 guarantee resting
on an operational rule nothing enforced: an enrolled clinician must not keep the
bootstrap password, because Keycloak goes on offering the password branch and the
account silently sits at AAL1 while looking passkey-protected.

**`ClinicianCredentialReconciler`** (`services/identity-access/src/passkeys/`) now
sweeps accounts holding the `gp`/`specialist` realm role and deletes the password of
any clinician who already holds a `webauthn-passwordless` credential — at bootstrap and
every 15 minutes. A clinician with a password but no passkey is deliberately skipped;
they are mid-onboarding and deleting it would lock them out with no recovery path.

Verified live: `2 clinician account(s) checked, 1 bootstrap password(s) removed` —
`gp.test` left with `['webauthn-passwordless']`, `specialist.test` untouched with
`['password']`, plus an `identity.bootstrap_password.removed` row in the audit index.

A reconciler rather than a hook because enrolment finishes inside Keycloak's own
required-action UI, which the service never sees; observing it would mean shipping a
Keycloak event-listener SPI JAR. The sweep is also self-healing against drift a hook
would miss (admin re-adding a password, realm re-import, restored backup) — which the
test exercised directly, since re-adding the password was how the drift state was
recreated.

**Least privilege beat the obvious query.** `GET /roles/{role}/users` returns exactly
the clinicians, but 403s for this service account, and unlocking it needs the
`view-realm` client role — read access to the whole realm config (clients, identity
providers, authentication flows) for what is only a credential reconciler. Per-user
role mappings turned out to be readable with the `view-users` the service already
documents needing, so the sweep enumerates users and filters instead. Slower at scale;
the tradeoff and the alternative are recorded in the code.

**The second silent audit-drop.** `identity-access` declared its IAM event names
locally and cast them to `AuditEventType`, with a comment asserting the cast was safe
because "the Audit Log Service accepts `type` as an opaque string over the wire". It
does not — `CreateAuditEventDto` validates `@IsIn(AUDIT_EVENT_TYPES)`. So every IAM
event this service ever wrote was rejected with 400. Worse than the outbox cases fixed
earlier the same day: these are deliberately *direct* writes with no outbox, so a
rejection dropped the event entirely rather than queuing a retry — meaning **passkey
revocations, the exact events you would want during an incident review, were never
recorded at all**. Registered `identity.passkey.revoked`,
`identity.passkey.reenrolment_required`, `identity.social_link.created`,
`identity.social_link.removed` and the new `identity.bootstrap_password.removed` in
both the shared union and audit-log's whitelist.

Two lessons worth carrying: a comment asserting a runtime contract ("the wire accepts
any string") is worth *verifying* before relying on it, and a whitelist shared between
a producer and consumer needs a test that fails when they drift — this is the second
time the same drift class caused silent data loss in one day.
