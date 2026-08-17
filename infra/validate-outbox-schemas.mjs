#!/usr/bin/env node
/**
 * Checks that every service's `AuditOutbox` Prisma model is identical.
 *
 * WHY. The outbox model is hand-copied into each service's `schema.prisma` — Prisma has
 * no include/import, so there is no way to share one definition. Those copies drift,
 * and the drift is invisible until it causes damage: on 2026-08-17 four services had
 * `attempts`/`lastError` and seven did not, which meant seven relays had no retry
 * bookkeeping at all and the four that did gave up permanently after ~40 seconds,
 * destroying audit records during ordinary restarts. Nothing failed loudly; the schemas
 * just quietly disagreed.
 *
 * The relay logic itself now lives in one shared package. This is the equivalent guard
 * for the part that cannot be shared.
 *
 * Run: `npm run validate:outbox`
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const servicesDir = join(repoRoot, 'services');

/** Field name -> normalised type/attribute text, so ordering and whitespace don't matter. */
function parseOutboxModel(schemaPath) {
  const src = readFileSync(schemaPath, 'utf8');
  const m = src.match(/model AuditOutbox \{([\s\S]*?)\n\}/);
  if (!m) return null;
  const fields = new Map();
  for (const raw of m[1].split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('///') || line.startsWith('@@')) continue;
    const [name, ...rest] = line.split(/\s+/);
    fields.set(name, rest.join(' ').replace(/\s+/g, ' '));
  }
  return fields;
}

const models = [];
for (const svc of readdirSync(servicesDir)) {
  const schema = join(servicesDir, svc, 'prisma', 'schema.prisma');
  if (!existsSync(schema)) continue;
  const fields = parseOutboxModel(schema);
  if (fields) models.push({ svc, fields });
}

if (models.length === 0) {
  console.error('No AuditOutbox models found — did the schema layout change?');
  process.exit(1);
}

// Compare every service against the union of all fields seen, so a field missing
// everywhere-but-one is reported just as loudly as one present everywhere-but-one.
const allFields = new Set(models.flatMap((m) => [...m.fields.keys()]));
const problems = [];

for (const field of [...allFields].sort()) {
  const types = new Map();
  for (const { svc, fields } of models) {
    const t = fields.has(field) ? fields.get(field) : '(missing)';
    if (!types.has(t)) types.set(t, []);
    types.get(t).push(svc);
  }
  if (types.size > 1) {
    const detail = [...types.entries()]
      .map(([t, svcs]) => `        ${t.padEnd(28)} ${svcs.join(', ')}`)
      .join('\n');
    problems.push(`  field "${field}" differs across services:\n${detail}`);
  }
}

if (problems.length > 0) {
  console.error(`AuditOutbox schema drift across ${models.length} services:\n`);
  console.error(problems.join('\n\n'));
  console.error(
    '\nEvery service must carry the same AuditOutbox model — the shared relay in ' +
      '@referralplatform/audit-outbox queries all of these columns.',
  );
  process.exit(1);
}

console.log(
  `AuditOutbox schema OK — identical across ${models.length} services ` +
    `(${allFields.size} fields: ${[...allFields].sort().join(', ')}).`,
);
