# @referralplatform/auth-client

TS client wrapping Keycloak OIDC token verification, for both user-facing auth
(patient/carer/GP/specialist/internal staff) and service-to-service calls. Built on
[`jose`](https://github.com/panva/jose) (pure-JS JOSE implementation — no native
dependencies, keeps every service's Docker image simple).

## User-facing auth: verifying an incoming request

```ts
import { TokenVerifier, requireAuth } from '@referralplatform/auth-client';

const verifier = new TokenVerifier({
  issuer: process.env.KEYCLOAK_ISSUER!, // e.g. http://keycloak:8080/realms/referralplatform
  audience: process.env.KEYCLOAK_CLIENT_ID,
});

app.use(requireAuth(verifier)); // req.auth is now an AuthenticatedPrincipal
```

## Service-to-service auth: calling another service (or packages/audit-client)

```ts
import { ServiceTokenProvider } from '@referralplatform/auth-client';

const tokens = new ServiceTokenProvider({
  issuer: process.env.KEYCLOAK_ISSUER!,
  clientId: process.env.KEYCLOAK_CLIENT_ID!,
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
});

const auditClient = new AuditClient({
  baseUrl: process.env.AUDIT_LOG_SERVICE_URL!,
  getServiceToken: () => tokens.getToken(),
});
```

## Step-up authentication and assurance levels

Per `identity-security-recommendations.md` section 6: patients/carers get passkey
(recommended) or OTP (fallback); GPs/specialists require passkey or a hardware
security key (AAL2/AAL3), not just OTP. This package doesn't enforce assurance
level itself (that's a Keycloak authentication-flow / realm configuration concern —
see `infra/keycloak/`) — it only verifies whatever token Keycloak issued. Services
that need to enforce step-up for a sensitive action (approving a new GP link,
granting deceased-patient access) should check the token's `acr`/`amr` claims via
`AuthenticatedPrincipal.raw` and reject if the assurance level is insufficient.

## Build / test

```bash
npm run build -w packages/auth-client
npm run test -w packages/auth-client
```
