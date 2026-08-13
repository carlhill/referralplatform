import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ImmudbClient from 'immudb-node';

/** What we hand back from a verified write — enough to anchor a later verify() call. */
export interface ImmudbWriteResult {
  /** immudb transaction id — the proof anchor. Stored in AuditEventIndex.immudbTxId. */
  txId: string;
}

/** What we hand back from a verified read. */
export interface ImmudbReadResult {
  txId: string;
  /** UTF-8 decoded value (immudb itself is bytes-in/bytes-out; we store JSON strings). */
  value: string;
}

/**
 * Thin wrapper around immudb-node's ImmudbClient, scoped to the two
 * operations this service actually needs: `verifiedSet` and `verifiedGet`.
 * Both perform *client-side* cryptographic proof verification (Merkle
 * inclusion + consistency proofs against the client's locally-tracked root
 * state) before resolving — that verification, not just "the server said
 * ok", is what makes this tamper-evident. See
 * claude/audit-log-architecture-decision.md.
 *
 * We deliberately don't use immudb-node's own `initClient(..., autoDatabase:
 * true)` convenience path: reading its source shows the "database already
 * exists" branch calls `useDatabase` with the SDK's hardcoded default
 * database name instead of the one we asked for, which would silently point
 * every write at the wrong immudb database on a warm restart. Doing login /
 * listDatabases / createDatabase / useDatabase ourselves avoids that.
 */
@Injectable()
export class ImmudbService implements OnModuleInit {
  private readonly logger = new Logger(ImmudbService.name);
  private client!: InstanceType<typeof ImmudbClient>;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const address = this.config.getOrThrow<string>('IMMUDB_ADDRESS');
    const [host, portStr] = address.split(':');
    const username = this.config.get<string>('IMMUDB_USERNAME', 'immudb');
    const password = this.config.get<string>('IMMUDB_PASSWORD', 'immudb');
    const database = this.config.get<string>('IMMUDB_DATABASE', 'audit_log');

    this.client = await ImmudbClient.getInstance({
      host,
      port: portStr ?? '3322',
    });

    await this.client.login({ user: username, password });
    const dbList = await this.client.listDatabases();
    const exists = dbList?.databasesList?.some((db: { databasename: string }) => db.databasename === database);
    if (!exists) {
      await this.client.createDatabase({ databasename: database });
      this.logger.log(`Created immudb database '${database}'`);
    }
    await this.client.useDatabase({ databasename: database });
    this.logger.log(`immudb connected — using database '${database}' at ${address}`);
  }

  /** Tamper-evidently write `value` under `key`, verifying the inclusion proof before resolving. */
  async verifiedSet(key: string, value: string): Promise<ImmudbWriteResult> {
    const meta = await this.client.verifiedSet({ key, value });
    if (!meta) {
      throw new Error('immudb verifiedSet returned no transaction metadata — write could not be proven');
    }
    return { txId: String(meta.id) };
  }

  /** Tamper-evidently read `key`, verifying the inclusion/consistency proof before resolving. */
  async verifiedGet(key: string): Promise<ImmudbReadResult> {
    const entry = await this.client.verifiedGet({ key });
    if (!entry) {
      throw new Error(`immudb verifiedGet returned no entry for key '${key}' (not found, or proof failed)`);
    }
    // Entry.toObject() base64-encodes key/value (see immudb-node's generated
    // proto toObject) — decode back to the UTF-8 JSON string we wrote.
    return { txId: String(entry.tx), value: Buffer.from(entry.value, 'base64').toString('utf8') };
  }
}
