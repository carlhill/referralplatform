import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuditEvent, AuditEventId, AuditEventType, ISODateTimeString } from '@referralplatform/shared-types';
import { canonicalJson } from '../common/canonical-json';
import { CryptoShreddingService } from '../crypto-shredding/crypto-shredding.service';
import { ImmudbService } from '../immudb/immudb.service';
import { PrismaService } from '../prisma/prisma.service';
import { NASH_SIGNER } from '../signing/signer.interface';
import type { Signer } from '../signing/signer.interface';
import type { CreateAuditEventDto } from './dto/create-audit-event.dto';

/** Stored in immudb — the full signed, (optionally) crypto-shredded envelope. */
interface StoredEnvelope {
  id: string;
  type: AuditEventType;
  actor: AuditEvent['actor'];
  subject: AuditEvent['subject'];
  payload: Record<string, unknown>;
  occurredAt: string;
  nashSignature: string;
  nashKeyId: string;
  nashAlgorithm: string;
  cryptoShredded: boolean;
  /** Whose KMS key payload.sensitive.* was encrypted under, if cryptoShredded. */
  cryptoShreddingOwnerId: string | null;
}

export interface VerifyAuditEventResult {
  eventId: string;
  valid: boolean;
  immudbTxId: string;
  verifiedAt: string;
  /** True only if the immudb inclusion proof AND the NASH signature both checked out. */
  details: { immudbProofValid: boolean; nashSignatureValid: boolean };
}

const IMMUDB_KEY_PREFIX = 'audit-event:';

@Injectable()
export class AuditEventsService {
  private readonly logger = new Logger(AuditEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly immudb: ImmudbService,
    private readonly cryptoShredding: CryptoShreddingService,
    @Inject(NASH_SIGNER) private readonly signer: Signer,
  ) {}

  /**
   * Every clinical/consent-relevant write's terminal step (directly, for
   * non-clinical events, or via a calling service's outbox relay — see root
   * CONVENTIONS.md §7). Order matters and is deliberate:
   *   1. crypto-shred sensitive payload fields (so plaintext never reaches immudb)
   *   2. NASH-sign the resulting (already-protected) envelope
   *   3. write to immudb, verifying the inclusion proof before resolving
   *   4. index the write in Postgres so the query API can find it by subject
   * If step 3 fails, this method throws and no Postgres index row is
   * written — a query for this event simply won't find it, rather than
   * pointing at a write that never happened.
   */
  async record(input: CreateAuditEventDto): Promise<AuditEvent> {
    const id = randomUUID() as AuditEventId;
    const occurredAt = (input.occurredAt ?? new Date().toISOString()) as ISODateTimeString;
    const ownerId = this.resolveCryptoShreddingOwner(input);

    const { payload, shredded } = await this.cryptoShredding.protectPayload(input.payload, ownerId);

    const unsigned = {
      id,
      type: input.type,
      actor: input.actor,
      subject: input.subject,
      payload,
      occurredAt,
    };
    const canonical = canonicalJson(unsigned);
    const signed = await this.signer.sign(canonical);

    const envelope: StoredEnvelope = {
      ...unsigned,
      nashSignature: signed.signature,
      nashKeyId: signed.keyId,
      nashAlgorithm: signed.algorithm,
      cryptoShredded: shredded,
      cryptoShreddingOwnerId: shredded ? ownerId : null,
    };

    const immudbKey = `${IMMUDB_KEY_PREFIX}${id}`;
    const write = await this.immudb.verifiedSet(immudbKey, JSON.stringify(envelope));

    await this.prisma.auditEventIndex.create({
      data: {
        id,
        type: input.type,
        actorPrincipalType: input.actor.principalType,
        actorId: input.actor.id,
        subjectType: input.subject.type,
        subjectId: input.subject.id,
        occurredAt: new Date(occurredAt),
        immudbKey,
        immudbTxId: write.txId,
        nashKeyId: signed.keyId,
      },
    });

    return {
      id,
      type: input.type,
      actor: input.actor,
      subject: input.subject,
      payload,
      occurredAt,
      immudbTxId: write.txId,
      nashSignature: signed.signature,
    };
  }

  async getById(id: string, opts: { revealSensitive?: boolean } = {}): Promise<AuditEvent> {
    const index = await this.prisma.auditEventIndex.findUnique({ where: { id } });
    if (!index) {
      throw new NotFoundException(`No audit event with id '${id}'`);
    }
    const read = await this.immudb.verifiedGet(index.immudbKey);
    const stored = JSON.parse(read.value) as StoredEnvelope;

    let payload = stored.payload;
    if (opts.revealSensitive && stored.cryptoShredded && stored.cryptoShreddingOwnerId) {
      payload = await this.cryptoShredding.revealPayload(stored.payload, stored.cryptoShreddingOwnerId);
    }

    return {
      id: stored.id as AuditEventId,
      type: stored.type,
      actor: stored.actor,
      subject: stored.subject,
      payload,
      occurredAt: stored.occurredAt as ISODateTimeString,
      immudbTxId: read.txId,
      nashSignature: stored.nashSignature,
    };
  }

  async listForSubject(subjectType: string, subjectId: string): Promise<AuditEvent[]> {
    const rows = await this.prisma.auditEventIndex.findMany({
      where: { subjectType, subjectId },
      orderBy: { occurredAt: 'asc' },
    });
    return Promise.all(rows.map((row: { id: string }) => this.getById(row.id)));
  }

  /**
   * Independently verifies an entry's tamper-evidence proof rather than
   * trusting the platform's word for it — see
   * claude/audit-log-architecture-decision.md, "A verification/query API".
   * Checks two independent things:
   *   1. immudb's own cryptographic (Merkle) proof — has this entry's stored
   *      bytes been altered since it was written? (verifiedGet() throws if not.)
   *   2. the NASH signature over the canonical envelope — was it actually
   *      signed by the key it claims, and does that signature still match
   *      the (immudb-proven-unaltered) content?
   * Both must hold for `valid: true`.
   */
  async verify(id: string): Promise<VerifyAuditEventResult> {
    const index = await this.prisma.auditEventIndex.findUnique({ where: { id } });
    if (!index) {
      throw new NotFoundException(`No audit event with id '${id}'`);
    }

    let immudbProofValid = true;
    let stored: StoredEnvelope | undefined;
    try {
      const read = await this.immudb.verifiedGet(index.immudbKey);
      stored = JSON.parse(read.value) as StoredEnvelope;
    } catch (err) {
      // Log the reason. A bare `catch {}` here previously reported a plain
      // JSON.parse failure (caused by a decoding bug in ImmudbService.verifiedGet)
      // as `immudbProofValid: false` — i.e. it looked exactly like tamper
      // detection on entries that were completely intact, with nothing logged to
      // tell the two apart. A failed proof and a failed decode are very different
      // incidents; never collapse them silently.
      immudbProofValid = false;
      this.logger.error(
        `Verification read failed for audit event '${id}' (immudb key '${index.immudbKey}'): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    let nashSignatureValid = false;
    if (stored) {
      const canonical = canonicalJson({
        id: stored.id,
        type: stored.type,
        actor: stored.actor,
        subject: stored.subject,
        payload: stored.payload,
        occurredAt: stored.occurredAt,
      });
      nashSignatureValid = await this.signer.verify(canonical, stored.nashSignature, stored.nashKeyId);
    }

    return {
      eventId: id,
      valid: immudbProofValid && nashSignatureValid,
      immudbTxId: index.immudbTxId,
      verifiedAt: new Date().toISOString(),
      details: { immudbProofValid, nashSignatureValid },
    };
  }

  /**
   * Which per-user KMS key owns `payload.sensitive.*` for this event.
   * Judgment call (documented in BUILD_LOG/audit-log.md): prefer the
   * subject when it's directly a Patient; fall back to an explicit
   * `payload.patientId` (for events whose subject is e.g. a Referral, not a
   * Patient directly); fall back to the actor otherwise (e.g. a GP's own
   * `carer.reattested` action about themselves). Every clinical event this
   * platform emits has a patient in scope one way or another per
   * modules-and-requirements.md, so this always resolves to *some* owner.
   */
  private resolveCryptoShreddingOwner(input: CreateAuditEventDto): string {
    if (input.subject.type === 'Patient') return input.subject.id;
    const patientId = input.payload?.patientId;
    if (typeof patientId === 'string' && patientId.length > 0) return patientId;
    return input.actor.id;
  }
}
