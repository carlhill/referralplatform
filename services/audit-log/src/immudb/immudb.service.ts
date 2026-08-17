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

    // autoLogin/autoDatabase default to true and, left enabled, getInstance()
    // runs its OWN internal login+listDatabases using IMMUDB_USER/IMMUDB_PWD
    // env vars (not the IMMUDB_USERNAME/IMMUDB_PASSWORD ones this service
    // actually sets) — silently skips that login, then still calls
    // listDatabases unauthenticated, throwing "please login" before this
    // method's own explicit login() below ever runs. Disabling both is what
    // this class's doc comment already says it intends: do it manually.
    this.client = await ImmudbClient.getInstance({
      host,
      port: portStr ?? '3322',
      autoLogin: false,
      autoDatabase: false,
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
    // NOTE: an earlier version assumed Entry.toObject() base64-encodes `value`
    // and did Buffer.from(value, 'base64'). It does not — immudb-node@1.1.1's
    // verifiedGet resolves `value` as an already-decoded UTF-8 string. Running it
    // through a base64 decode turned valid JSON into garbage, so JSON.parse threw
    // in the caller and every /audit-events/:id/verify reported the immudb proof
    // as INVALID — i.e. the tamper-evidence check failed on entries that were in
    // fact perfectly intact. Verified against a live immudb 1.1.0 by calling
    // verifiedGet directly: it returns `typeof value === 'string'` holding the
    // exact JSON envelope that was written. See BUILD_LOG/local-build-fixes.md.
    const value = typeof entry.value === 'string' ? entry.value : Buffer.from(entry.value).toString('utf8');
    return { txId: String(entry.tx), value };
  }
}
