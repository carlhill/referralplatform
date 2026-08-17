#!/usr/bin/env node
/**
 * Static checks on `realm-export.json` for the constraint classes that have actually
 * broken this repo's realm import.
 *
 * WHY. Keycloak ships no standalone realm-JSON validator: the only validation is the
 * real import at container startup, and it is **fail-fast and sequential** — it stops
 * at the first bad field and won't reveal the next until that one is fixed. Worse, a
 * broken file does not announce itself on a machine whose realm already exists, because
 * `--import-realm` skips import when the realm is present. So the file can rot for days
 * and only fail for the next person doing a clean deployment.
 *
 * That is not hypothetical: on 2026-08-17 two authentication-flow descriptions written
 * during the clinician-login fix were 466 and 416 characters against a VARCHAR(255)
 * column, which made the checked-in realm un-importable. It was caught only by
 * deliberately importing into a throwaway Keycloak.
 *
 * Run: `npm run validate:realm`
 *
 * This is deliberately cheap and static. The definitive test is still an import into a
 * clean Keycloak:
 *   docker run --rm -p 20099:8080 \
 *     -v "<abs path>/realm-export.json:/opt/keycloak/data/import/realm-export.json:ro" \
 *     -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=probe -e KC_DB=dev-mem \
 *     quay.io/keycloak/keycloak:26.0 start-dev --import-realm
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, 'realm-export.json');

/** Keycloak persists these into VARCHAR(255) columns. */
const MAX_DESCRIPTION = 255;

const problems = [];
const realm = JSON.parse(readFileSync(file, 'utf8'));

function label(node) {
  return node?.alias ?? node?.clientId ?? node?.name ?? '(unnamed)';
}

function walk(node, path) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`));
    return;
  }
  if (!node || typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    // Fake "_comment" style keys: JSON has no comments, and Keycloak's Jackson
    // deserializer rejects unknown fields outright rather than ignoring them.
    if (key.startsWith('_')) {
      problems.push(`${path}.${key} — unknown field (Keycloak rejects these; put notes in the docs instead)`);
    }
    if (key === 'description' && typeof value === 'string' && value.length > MAX_DESCRIPTION) {
      problems.push(
        `${path} "${label(node)}" — description is ${value.length} chars, limit is ${MAX_DESCRIPTION}. ` +
          `Import fails with 'Value too long for column "DESCRIPTION"'.`,
      );
    }
    walk(value, `${path}.${key}`);
  }
}

walk(realm, '$');

// Duplicate clientIds import "successfully" but leave one client silently unusable.
const seen = new Set();
for (const c of realm.clients ?? []) {
  if (seen.has(c.clientId)) problems.push(`duplicate clientId: ${c.clientId}`);
  seen.add(c.clientId);
}

if (problems.length > 0) {
  console.error(`realm-export.json: ${problems.length} problem(s) that would break import\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `realm-export.json OK — ${realm.clients?.length ?? 0} clients, ` +
    `${realm.authenticationFlows?.length ?? 0} auth flows, ` +
    `${realm.clientScopes?.length ?? 0} client scopes, no import-breaking issues found.`,
);
