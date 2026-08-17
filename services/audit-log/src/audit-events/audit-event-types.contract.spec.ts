// Must precede the DTO import: it carries class-validator/class-transformer
// decorators, which need Reflect.getMetadata to exist at module-evaluation time.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIT_EVENT_TYPES } from './dto/create-audit-event.dto';

/**
 * Contract test between the producers' canonical event-type union
 * (`packages/shared-types/src/audit-event.ts`) and this service's runtime
 * whitelist (`AUDIT_EVENT_TYPES`, used by `@IsIn` on the create DTO).
 *
 * WHY THIS EXISTS. The two drifted twice on 2026-08-17, and both times the
 * failure mode was silent data loss rather than a visible error:
 *   - ten types emitted by onboarding-account and admin-console were absent from
 *     the whitelist, so the service 400'd every write; the producers' outboxes
 *     retried until they hit the attempts cap and then stopped, so OTP issuance
 *     and HPI-O verification simply never reached the audit trail;
 *   - four `identity.*` types from identity-access were absent too, and since
 *     that service writes directly rather than through an outbox, those events
 *     were discarded outright — passkey revocations among them.
 * Nothing anywhere failed loudly. The audit trail just quietly stopped recording
 * whole categories of event, which for a platform whose core compliance claim is
 * an immutable audit trail is close to the worst kind of bug.
 *
 * `create-audit-event.dto.ts` also asserts this at compile time, which is the
 * stronger guard (it fails the build). This test exists alongside it because it
 * reads the *source of truth file* rather than the compiled type, so it also
 * catches someone weakening or deleting that assertion, and because a failure here
 * names the offending event types in plain English instead of as a type error.
 */
describe('AuditEventType <-> AUDIT_EVENT_TYPES contract', () => {
  /**
   * Parsed from source rather than imported, because `AuditEventType` is a TS
   * union — it does not exist at runtime, so there is nothing to import.
   */
  function unionMembersFromSharedTypes(): string[] {
    const sharedTypesPath = join(__dirname, '../../../../packages/shared-types/src/audit-event.ts');
    const source = readFileSync(sharedTypesPath, 'utf8');

    // Strip comments BEFORE locating the union, not after. The declaration is matched
    // up to its terminating `;`, and prose in an interleaved comment can legitimately
    // contain a semicolon — one did, which silently truncated the parsed union and made
    // every member after it look like it was missing from shared-types.
    // Whole-line `//` only, so a `https://` inside prose can't eat the rest of its line.
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');

    const declaration = /export type AuditEventType\s*=([\s\S]*?);/.exec(withoutComments);
    if (!declaration) {
      throw new Error(
        `Could not find the AuditEventType union in ${sharedTypesPath}. If it was renamed or ` +
          `restructured, update this test — do not delete it.`,
      );
    }

    return [...declaration[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }

  it('has no duplicate entries in the runtime whitelist', () => {
    const seen = new Set<string>();
    const duplicates = AUDIT_EVENT_TYPES.filter((t) => (seen.has(t) ? true : (seen.add(t), false)));
    expect(duplicates).toEqual([]);
  });

  it('whitelists every event type producers are allowed to emit', () => {
    const missing = unionMembersFromSharedTypes().filter((t) => !AUDIT_EVENT_TYPES.includes(t as never));

    // These would be rejected with 400 at runtime: outbox-backed producers would
    // retry to their attempts cap and give up; direct writers would lose them.
    expect(missing).toEqual([]);
  });

  it('does not whitelist anything the shared union does not define', () => {
    const union = new Set(unionMembersFromSharedTypes());
    const unknown = AUDIT_EVENT_TYPES.filter((t) => !union.has(t));

    // These would be accepted and stored, but no consumer of the audit log knows
    // how to interpret them.
    expect(unknown).toEqual([]);
  });
});
