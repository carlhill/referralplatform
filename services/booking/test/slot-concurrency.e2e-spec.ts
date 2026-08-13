import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * **The real proof behind the "concurrency-safe slot booking" requirement.**
 *
 * `SlotClaimService.claim()` (src/booking/slot-claim.service.ts) relies on a
 * single fact about Postgres: a plain `UPDATE ... WHERE status = 'open'`
 * statement is atomic — Postgres holds a row lock for the statement's
 * duration, so two truly concurrent transactions attempting to update the
 * *same row* can never both see `status = 'open'` and both succeed; the
 * loser's WHERE clause simply matches zero rows once it gets its turn. The
 * in-process unit test (slot-claim.service.spec.ts) proves
 * `SlotClaimService`'s own orchestration logic is race-free GIVEN that
 * guarantee (using a fake Prisma client engineered to only offer exactly
 * that guarantee — see fake-prisma.ts's doc comment). It does NOT prove
 * Postgres itself actually behaves this way — that's not something any
 * in-process fake can prove.
 *
 * THIS test proves that half: it runs the literal SQL
 * `SlotClaimService.claim()` relies on (Prisma's `updateMany({ where: { id,
 * status: 'open' }, data: {...} })` compiles to exactly this) directly
 * against this sandbox's real local Postgres instance — not a fake, not an
 * in-memory simulation — using many genuinely separate OS-level `psql`
 * client processes (separate TCP connections, separate Postgres backends)
 * fired concurrently via `Promise.all`. This is a stronger proof than
 * anything achievable via a single Node process's in-memory concurrency,
 * because it can't be an artifact of JS's single-threaded scheduling —
 * these are actually-parallel client connections racing a real database.
 *
 * **Why via `psql` subprocesses rather than through this service's own
 * generated Prisma client**: `prisma generate` needs to download a
 * schema-engine binary from binaries.prisma.sh, which this sandbox's
 * outbound egress policy blocks (confirmed via the agent proxy status
 * endpoint as a policy denial — see test/stubs/prisma-client.stub.ts and
 * BUILD_LOG/booking.md for the full, already-documented story, identical to
 * every other service in this build). `psql` and a real local Postgres
 * instance (with this service's own `booking` schema already migrated —
 * see prisma/migrations/20260813180000_init/migration.sql, which WAS
 * applied directly to it) are both available in this sandbox, so this test
 * uses them to prove the actual DB-level guarantee the production code
 * depends on, independent of whether the Node Prisma client can be built
 * here. In a normal dev/CI environment where `prisma generate` succeeds,
 * this test still passes unchanged (it only depends on `psql` + Postgres
 * being reachable) and remains a legitimate, independent proof even once a
 * generated-Prisma-client e2e test suite is added on top.
 *
 * Connection details match .env.example / docker-compose.yml's `postgres`
 * service (`referralplatform`/`referralplatform`@localhost:5432/
 * referralplatform) — overridable via PG* env vars for other environments.
 */

const PG_HOST = process.env.PGHOST ?? 'localhost';
const PG_PORT = process.env.PGPORT ?? '5432';
const PG_USER = process.env.PGUSER ?? 'referralplatform';
const PG_PASSWORD = process.env.PGPASSWORD ?? 'referralplatform';
const PG_DATABASE = process.env.PGDATABASE ?? 'referralplatform';

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync('psql', ['-h', PG_HOST, '-p', PG_PORT, '-U', PG_USER, '-d', PG_DATABASE, '-c', sql], {
    env: { ...process.env, PGPASSWORD: PG_PASSWORD },
  });
  return stdout;
}

async function psqlTuple(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'psql',
    ['-h', PG_HOST, '-p', PG_PORT, '-U', PG_USER, '-d', PG_DATABASE, '-t', '-A', '-c', sql],
    { env: { ...process.env, PGPASSWORD: PG_PASSWORD } },
  );
  return stdout.trim();
}

/** Returns true and logs a clear reason if this sandbox doesn't have a reachable Postgres with this service's schema migrated — lets this suite skip cleanly elsewhere rather than hard-failing CI environments without a local Postgres. */
async function postgresUnavailable(): Promise<string | null> {
  try {
    await psql("SELECT 1 FROM information_schema.tables WHERE table_schema = 'booking' AND table_name = 'slot'");
    return null;
  } catch (err) {
    return `Real Postgres at ${PG_HOST}:${PG_PORT} with a migrated booking.slot table is not reachable — skipping the real-DB concurrency proof (see slot-claim.service.spec.ts for the in-process equivalent). Reason: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }
}

describe('Slot concurrency — real Postgres proof', () => {
  let skipReason: string | null = null;

  beforeAll(async () => {
    skipReason = await postgresUnavailable();
    if (skipReason) {
      console.warn(skipReason);
    }
  });

  async function seedOpenSlot(): Promise<string> {
    const id = randomUUID();
    await psql(
      `INSERT INTO booking.slot (id, "specialistId", "startsAt", "endsAt", status, version, "updatedAt") ` +
        `VALUES ('${id}', 'spec-concurrency-test', now(), now() + interval '30 minutes', 'open', 0, now())`,
    );
    return id;
  }

  async function deleteSlot(id: string): Promise<void> {
    await psql(`DELETE FROM booking.slot WHERE id = '${id}'`);
  }

  /**
   * THE proof: N concurrent, genuinely separate `psql` processes each try
   * the exact atomic claim statement `SlotClaimService.claim()` relies on,
   * against the SAME slot row. Only one may succeed.
   */
  it(
    'only one of many concurrent UPDATE ... WHERE status = \'open\' attempts on the same real row succeeds',
    async () => {
      if (skipReason) return;

      const slotId = await seedOpenSlot();
      const CONCURRENT_ATTEMPTS = 20;
      const bookingIds = Array.from({ length: CONCURRENT_ATTEMPTS }, () => randomUUID());

      try {
        // Fired via Promise.all — every psql invocation starts at
        // approximately the same wall-clock moment, each opening its own
        // real TCP connection/Postgres backend. This is the literal SQL
        // Prisma's `updateMany({ where: { id, status: 'open' }, data: {
        // status: 'booked', bookingId, version: { increment: 1 } } })`
        // compiles to.
        const results = await Promise.all(
          bookingIds.map((bookingId) =>
            psql(
              `UPDATE booking.slot SET status = 'booked', "bookingId" = '${bookingId}', version = version + 1, "updatedAt" = now() ` +
                `WHERE id = '${slotId}' AND status = 'open'`,
            ),
          ),
        );

        // psql's default command-tag output for a successful UPDATE is "UPDATE <n>".
        const winners = results.filter((r) => /UPDATE 1\b/.test(r));
        const losers = results.filter((r) => /UPDATE 0\b/.test(r));

        expect(winners).toHaveLength(1);
        expect(losers).toHaveLength(CONCURRENT_ATTEMPTS - 1);

        // The row itself ends up claimed by exactly one bookingId, version
        // incremented exactly once — not once per attempt.
        const finalState = await psqlTuple(`SELECT status, version, "bookingId" FROM booking.slot WHERE id = '${slotId}'`);
        const [status, version, bookingId] = finalState.split('|');
        expect(status).toBe('booked');
        expect(version).toBe('1');
        expect(bookingIds).toContain(bookingId);
      } finally {
        await deleteSlot(slotId);
      }
    },
    30000,
  );

  it('a slot that is already booked rejects every further concurrent claim attempt (0 winners)', async () => {
    if (skipReason) return;

    const slotId = await seedOpenSlot();
    await psql(`UPDATE booking.slot SET status = 'booked', "bookingId" = '${randomUUID()}' WHERE id = '${slotId}'`);

    try {
      const bookingIds = Array.from({ length: 10 }, () => randomUUID());
      const results = await Promise.all(
        bookingIds.map((bookingId) =>
          psql(`UPDATE booking.slot SET status = 'booked', "bookingId" = '${bookingId}' WHERE id = '${slotId}' AND status = 'open'`),
        ),
      );
      expect(results.every((r) => /UPDATE 0\b/.test(r))).toBe(true);
    } finally {
      await deleteSlot(slotId);
    }
  });

  it('concurrent claims on DISTINCT slots never falsely contend with each other', async () => {
    if (skipReason) return;

    const slotIds = await Promise.all(Array.from({ length: 10 }, () => seedOpenSlot()));
    try {
      const results = await Promise.all(
        slotIds.map((slotId) =>
          psql(`UPDATE booking.slot SET status = 'booked', "bookingId" = '${randomUUID()}' WHERE id = '${slotId}' AND status = 'open'`),
        ),
      );
      expect(results.every((r) => /UPDATE 1\b/.test(r))).toBe(true);
    } finally {
      await Promise.all(slotIds.map((id) => deleteSlot(id)));
    }
  });
});
