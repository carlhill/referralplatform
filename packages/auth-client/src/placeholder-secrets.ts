/**
 * Refuses to run with local-development placeholder credentials in production.
 *
 * WHY. `change-me-in-local-env` appears 18 times in `docker-compose.yml` and 14 times
 * in `realm-export.json`, alongside `admin`/`admin` for Keycloak and
 * `referralplatform:referralplatform` for Postgres. That is fine locally and
 * deliberate — but nothing anywhere stopped those values reaching a deployed
 * environment, and a placeholder that ships is indistinguishable from a real secret
 * until someone tries it. For a platform holding PHI under an HPI-O, that is the
 * cheapest possible catastrophic failure.
 *
 * Fails **closed and at startup**: a service that would authenticate with a known
 * placeholder should not boot at all, rather than serve traffic while quietly
 * accepting a password an attacker can read off GitHub. Deliberately inert outside
 * production so local dev, tests and CI are unaffected.
 *
 * This is a backstop, not a secrets strategy. The real fix is injected secrets from a
 * vault/parameter store; see TODO. It exists because a backstop that runs today beats
 * a strategy that is still a plan.
 */

/** Values that must never authenticate anything in production. */
const PLACEHOLDER_VALUES = new Set([
  'change-me-in-local-env',
  'changeme',
  'change-me',
  'password',
  'secret',
  'admin',
  'test',
  'referralplatform',
]);

/** True when the value is a known placeholder, or obviously a stand-in for one. */
export function isPlaceholderSecret(value: string | undefined | null): boolean {
  if (!value) return true; // empty/absent is at least as bad as a placeholder
  const v = value.trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(v) || v.startsWith('change-me') || v.startsWith('changeme');
}

/** Production is the only mode this guard applies to. */
export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Throws in production if `value` is a placeholder. No-ops everywhere else.
 *
 * @param name  what is being checked, named as an operator would recognise it
 *              (e.g. `KEYCLOAK_CLIENT_SECRET`) so the failure is actionable.
 */
export function assertNotPlaceholderSecret(
  name: string,
  value: string | undefined | null,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isProductionRuntime(env)) return;
  if (!isPlaceholderSecret(value)) return;

  throw new Error(
    `Refusing to start: ${name} is unset or still a local-development placeholder ` +
      `while NODE_ENV=production. These values are committed to the repository and are ` +
      `public. Supply a real secret (see docker-compose.yml and infra/keycloak/realm-export.json ` +
      `for every placeholder that must be replaced before a deployment).`,
  );
}
