import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnboardingService } from './onboarding.service';

const OTP_SECRET = 'test-otp-secret';

// ---------------------------------------------------------------------------
// A small, purpose-built in-memory fake of the subset of the Prisma client
// OnboardingService actually calls — realistic enough (real filtering,
// real relations between patient/accountActivationRequest/carer/otpChallenge)
// to exercise the service's real branching logic end to end without a
// database, which is what this service's control flow actually needs tested
// (dedup, lockout counters, status transitions) rather than canned
// per-call return values.
// ---------------------------------------------------------------------------
function createFakeDb() {
  const tables: Record<string, Map<string, any>> = {
    patient: new Map(),
    gpPractice: new Map(),
    accountActivationRequest: new Map(),
    carer: new Map(),
    otpChallenge: new Map(),
  };
  const counters: Record<string, number> = {};

  function nextId(table: string): string {
    counters[table] = (counters[table] ?? 0) + 1;
    return `${table}_${counters[table]}`;
  }

  function matchesCondition(actual: unknown, cond: unknown): boolean {
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ('not' in c) return actual !== c.not;
      if ('gte' in c) return actual !== undefined && actual !== null && (actual as any) >= (c.gte as any);
      if ('lt' in c) return actual !== undefined && actual !== null && (actual as any) < (c.lt as any);
      if ('equals' in c) {
        if (c.mode === 'insensitive') {
          return String(actual ?? '').toLowerCase() === String(c.equals ?? '').toLowerCase();
        }
        return actual === c.equals;
      }
    }
    // A real Postgres/Prisma column that was never explicitly set on create
    // is NULL, not "the JS key is missing" — this fake stores such fields as
    // `undefined`, so treat `undefined` and `null` as equivalent when the
    // query is explicitly looking for a null column (e.g. `consumedAt: null`).
    if (cond === null) return actual === null || actual === undefined;
    return actual === cond;
  }

  function rowMatches(table: string, row: any, where: Record<string, unknown>): boolean {
    for (const key of Object.keys(where)) {
      const cond = where[key];
      if (key === 'OR') {
        if (!(cond as Record<string, unknown>[]).some((sub) => rowMatches(table, row, sub))) return false;
        continue;
      }
      if (key === 'patient') {
        const patient = tables.patient.get(row.patientId);
        if (!patient || !rowMatches('patient', patient, cond as Record<string, unknown>)) return false;
        continue;
      }
      if (!matchesCondition(row[key], cond)) return false;
    }
    return true;
  }

  function findMany(table: string, where: Record<string, unknown> = {}) {
    return [...tables[table].values()].filter((row) => rowMatches(table, row, where));
  }

  // Mirrors the `@default(...)` values declared in prisma/schema.prisma —
  // this in-memory fake has no schema of its own to read defaults from, so
  // they're reproduced by hand here. Keep in sync with schema.prisma if a
  // default there ever changes.
  const schemaDefaults: Record<string, Record<string, unknown>> = {
    patient: { status: 'pending_activation', isMinor: false, sensitiveCategoriesHiddenFromDelegates: [] },
    accountActivationRequest: {
      status: 'pending',
      otpDeliveryChannel: 'email',
      identityVerifyAttempts: 0,
    },
    carer: { tier: 'nominated_delegate', suspectedOrganisationalCarer: false },
    otpChallenge: { attemptCount: 0, maxAttempts: 5 },
    gpPractice: { verificationStatus: 'pending', integrationTier: 'A' },
    specialist: {
      ahpraVerificationStatus: 'pending',
      hpiIResolutionStatus: 'pending',
      nashCredentialStatus: 'pending',
      directoryProfileStatus: 'pending',
      econsultOptIn: false,
    },
  };

  function model(table: string) {
    return {
      async create({ data }: any) {
        const id = data.id ?? nextId(table);
        const row = { ...schemaDefaults[table], id, createdAt: new Date(), updatedAt: new Date(), ...data };
        tables[table].set(id, row);
        return { ...row };
      },
      async findUnique({ where }: any) {
        const rows = findMany(table, where);
        return rows[0] ? { ...rows[0] } : null;
      },
      async findUniqueOrThrow({ where }: any) {
        const rows = findMany(table, where);
        if (!rows[0]) throw new Error(`${table} not found`);
        return { ...rows[0] };
      },
      async findFirst({ where = {}, orderBy }: any = {}) {
        let rows = findMany(table, where);
        if (orderBy?.createdAt === 'desc') {
          rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return rows[0] ? { ...rows[0] } : null;
      },
      async findMany({ where = {} }: any = {}) {
        return findMany(table, where).map((r) => ({ ...r }));
      },
      async update({ where, data }: any) {
        const rows = findMany(table, where);
        if (!rows[0]) throw new Error(`${table} not found for update`);
        const existing = tables[table].get(rows[0].id);
        const cleanData = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        const updated = { ...existing, ...cleanData, updatedAt: new Date() };
        tables[table].set(rows[0].id, updated);
        return { ...updated };
      },
      async count({ where = {} }: any = {}) {
        return findMany(table, where).length;
      },
    };
  }

  return {
    patient: model('patient'),
    gpPractice: model('gpPractice'),
    accountActivationRequest: model('accountActivationRequest'),
    carer: model('carer'),
    otpChallenge: model('otpChallenge'),
    async $transaction(cb: (tx: unknown) => Promise<unknown>) {
      // No real transactional isolation needed for these tests — the fake
      // applies writes immediately, same as calling the model methods
      // directly, which is sufficient to test the service's control flow.
      return cb(this);
    },
  };
}

function makeConfig(overrides: Record<string, number | string> = {}): ConfigService {
  const values: Record<string, number | string> = {
    OTP_HASH_SECRET: OTP_SECRET,
    ACTIVATION_LINK_BASE_URL: 'http://localhost:3102/activate',
    ...overrides,
  };
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    getOrThrow: (key: string) => {
      const v = values[key];
      if (v === undefined) throw new Error(`missing config ${key}`);
      return v;
    },
  } as unknown as ConfigService;
}

function makeAuditOutbox() {
  return { enqueue: jest.fn(), enqueueStandalone: jest.fn() } as any;
}

function makeEmail() {
  return { sendActivationLinkEmail: jest.fn(), sendOtpEmail: jest.fn() } as any;
}

function makeIdentityAccess() {
  return {
    promptPasskeyEnrolment: jest.fn().mockResolvedValue({ prompted: false, reason: 'not configured in test' }),
  } as any;
}

function makeHiService() {
  return {
    resolveIhi: jest.fn().mockResolvedValue({ ihi: '8003608000000001', matchConfidence: 'probable' }),
  } as any;
}

async function seedVerifiedPractice(db: ReturnType<typeof createFakeDb>, hpiO = '8003620000000000') {
  await db.gpPractice.create({
    data: {
      practiceName: 'Riverside Medical',
      hpiO,
      contactEmail: 'admin@riverside.example.au',
      state: 'VIC',
      verificationStatus: 'verified',
      complianceChecklistAcknowledgedAt: new Date(),
    },
  });
}

function buildService(db: ReturnType<typeof createFakeDb>, opts: { config?: ConfigService; hiService?: any } = {}) {
  const auditOutbox = makeAuditOutbox();
  const email = makeEmail();
  const identityAccess = makeIdentityAccess();
  const hiService = opts.hiService ?? makeHiService();
  const service = new OnboardingService(
    db as any,
    opts.config ?? makeConfig(),
    auditOutbox,
    hiService,
    email,
    identityAccess,
  );
  return { service, auditOutbox, email, identityAccess, hiService };
}

const baseRequestDto = {
  triggeringGpId: 'gp_1',
  triggeringGpHpiO: '8003620000000000',
  patientGivenName: 'Jane',
  patientFamilyName: 'Citizen',
  patientDateOfBirth: '1990-05-12',
  patientMobileNumber: '0412345678',
  patientEmail: 'jane@example.com',
};

describe('OnboardingService.requestActivation', () => {
  it('rejects a GP whose practice is not verified/compliance-acknowledged', async () => {
    const db = createFakeDb();
    const { service } = buildService(db);
    await expect(service.requestActivation(baseRequestDto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a patient and activation request, and emails the activation link', async () => {
    const db = createFakeDb();
    await seedVerifiedPractice(db);
    const { service, email } = buildService(db);

    const result = await service.requestActivation(baseRequestDto);

    expect(result.activationRequestId).toBeDefined();
    expect(email.sendActivationLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jane@example.com', patientFirstName: 'Jane' }),
    );

    const patient = await db.patient.findUnique({ where: { id: result.patientId } });
    expect(patient.status).toBe('pending_activation');
    expect(patient.ihi).toBe('8003608000000001');
  });

  it('rejects creating a duplicate account for a patient who already has an active account', async () => {
    const db = createFakeDb();
    await seedVerifiedPractice(db);
    await db.patient.create({
      data: {
        ihi: '8003608000000001',
        givenName: 'Jane',
        familyName: 'Citizen',
        status: 'active',
        dateOfBirth: new Date(),
        mobileNumber: '0412345678',
      },
    });
    const { service } = buildService(db);

    await expect(service.requestActivation(baseRequestDto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('reuses the existing patient row for a resend against a still-pending account', async () => {
    const db = createFakeDb();
    await seedVerifiedPractice(db);
    const existing = await db.patient.create({
      data: {
        ihi: '8003608000000001',
        givenName: 'Jane',
        familyName: 'Citizen',
        status: 'pending_activation',
        dateOfBirth: new Date(),
        mobileNumber: '0412345678',
      },
    });
    const { service } = buildService(db);

    const result = await service.requestActivation(baseRequestDto);
    expect(result.patientId).toBe(existing.id);
    expect((await db.patient.findMany()).length).toBe(1);
  });

  it('enforces the per-GP rate limit', async () => {
    const db = createFakeDb();
    await seedVerifiedPractice(db);
    const config = makeConfig({ ACCOUNT_REQUEST_MAX_PER_GP_PER_HOUR: 1 });
    const { service } = buildService(db, { config });

    await service.requestActivation(baseRequestDto);
    await expect(
      service.requestActivation({
        ...baseRequestDto,
        patientMobileNumber: '0498765432',
        patientEmail: 'other@example.com',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('OnboardingService — identity verification, branch, OTP', () => {
  async function setupActivatedRequest(overrides: { dob?: string; medicare?: string } = {}) {
    const db = createFakeDb();
    await seedVerifiedPractice(db);
    const config = makeConfig();
    const { service, email } = buildService(db, { config });

    const dto = {
      ...baseRequestDto,
      patientDateOfBirth: overrides.dob ?? baseRequestDto.patientDateOfBirth,
      patientMedicareNumber: overrides.medicare,
    };
    await service.requestActivation(dto);

    // Recover the raw token the way a real activation link would carry it —
    // the service never returns it, so read it back out of the (test-only)
    // email mock call, which is the one place it's genuinely delivered.
    const activationUrl: string = email.sendActivationLinkEmail.mock.calls[0][0].activationUrl;
    const token = new URL(activationUrl).searchParams.get('token')!;

    return { db, service, email, token, dto };
  }

  it('verifies matching DOB and advances to identity_verified', async () => {
    const { service, token, db } = await setupActivatedRequest();
    const result = await service.verifyIdentity(token, { dateOfBirth: '1990-05-12' });
    expect(result.status).toBe('identity_verified');

    const requestRow = await db.accountActivationRequest.findFirst({ where: {} });
    expect(requestRow.status).toBe('identity_verified');
  });

  it('rejects a mismatched DOB and eventually locks after repeated failures', async () => {
    const config = makeConfig({ IDENTITY_VERIFY_MAX_ATTEMPTS: 2 });
    const db = createFakeDb();
    await seedVerifiedPractice(db);
    const { service, email } = buildService(db, { config });
    await service.requestActivation(baseRequestDto);
    const token = new URL(email.sendActivationLinkEmail.mock.calls[0][0].activationUrl).searchParams.get('token')!;

    await expect(service.verifyIdentity(token, { dateOfBirth: '2000-01-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.verifyIdentity(token, { dateOfBirth: '2000-01-01' })).rejects.toThrow(/locked/);
    await expect(service.verifyIdentity(token, { dateOfBirth: '1990-05-12' })).rejects.toThrow(/Too many failed/);
  });

  it('sends an OTP to the patient themself on the "it\'s me" branch', async () => {
    const { service, token, email } = await setupActivatedRequest();
    await service.verifyIdentity(token, { dateOfBirth: '1990-05-12' });
    email.sendOtpEmail.mockClear();

    const result = await service.selectBranch(token, { role: 'patient' });
    expect(result.status).toBe('otp_sent');
    expect(email.sendOtpEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'jane@example.com' }));
  });

  it('creates a Carer row and sends the OTP to the carer\'s own email on the "helping someone else" branch', async () => {
    const { service, token, email, db } = await setupActivatedRequest();
    await service.verifyIdentity(token, { dateOfBirth: '1990-05-12' });
    email.sendOtpEmail.mockClear();

    await service.selectBranch(token, {
      role: 'carer',
      carer: {
        givenName: 'Sam',
        familyName: 'Carer',
        email: 'sam.carer@example.com',
        relationship: 'adult_child',
        sharesPatientMobileNumber: false,
        ownMobileNumber: '0411111111',
      },
    });

    expect(email.sendOtpEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'sam.carer@example.com' }));
    const carers = await db.carer.findMany();
    expect(carers).toHaveLength(1);
    expect(carers[0].tier).toBe('nominated_delegate');
  });

  it('flags a carer as suspected organisational after repeated appearances across unrelated patients', async () => {
    const config = makeConfig({ ORG_CARER_THRESHOLD: 2 });
    const db = createFakeDb();
    await seedVerifiedPractice(db);
    const { service: service1, email: email1 } = buildService(db, { config });
    await service1.requestActivation(baseRequestDto);
    const token1 = new URL(email1.sendActivationLinkEmail.mock.calls[0][0].activationUrl).searchParams.get('token')!;
    await service1.verifyIdentity(token1, { dateOfBirth: '1990-05-12' });
    await service1.selectBranch(token1, {
      role: 'carer',
      carer: {
        givenName: 'Sam',
        familyName: 'Carer',
        email: 'sam.carer@example.com',
        relationship: 'other',
        sharesPatientMobileNumber: true,
      },
    });

    // A second, unrelated patient, same carer email.
    const { service: service2, email: email2, hiService } = buildService(db, { config });
    hiService.resolveIhi.mockResolvedValue({ ihi: '8003608000000099', matchConfidence: 'probable' });
    await service2.requestActivation({
      ...baseRequestDto,
      patientMobileNumber: '0498765432',
      patientEmail: 'other-patient@example.com',
    });
    const token2 = new URL(email2.sendActivationLinkEmail.mock.calls[0][0].activationUrl).searchParams.get('token')!;
    await service2.verifyIdentity(token2, { dateOfBirth: '1990-05-12' });
    await service2.selectBranch(token2, {
      role: 'carer',
      carer: {
        givenName: 'Sam',
        familyName: 'Carer',
        email: 'sam.carer@example.com',
        relationship: 'other',
        sharesPatientMobileNumber: true,
      },
    });

    const carers = await db.carer.findMany();
    const secondCarer = carers.find((c: any) => c.patientId !== carers[0].patientId);
    expect(secondCarer.suspectedOrganisationalCarer).toBe(true);
  });

  it('blocks a minor patient from choosing the "it\'s me" branch', async () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 10); // 10-year-old
    const { service, token } = await setupActivatedRequest({ dob: dob.toISOString().slice(0, 10) });
    await service.verifyIdentity(token, { dateOfBirth: dob.toISOString().slice(0, 10) });

    await expect(service.selectBranch(token, { role: 'patient' })).rejects.toThrow(/minor/);
  });

  it('verifies a correct OTP and activates the patient account', async () => {
    const { service, token, email, db } = await setupActivatedRequest();
    await service.verifyIdentity(token, { dateOfBirth: '1990-05-12' });
    await service.selectBranch(token, { role: 'patient' });

    const sentCode = extractOtpCode(email.sendOtpEmail.mock.calls.at(-1)[0]);
    const result = await service.verifyOtp(token, { code: sentCode });

    expect(result.status).toBe('activated');
    const patient = await db.patient.findUnique({ where: { id: result.patientId } });
    expect(patient.status).toBe('active');
  });

  it('locks out OTP verification after repeated wrong codes', async () => {
    const config = makeConfig({ OTP_MAX_ATTEMPTS: 2 });
    const db = createFakeDb();
    await seedVerifiedPractice(db);
    const { service, email } = buildService(db, { config });
    await service.requestActivation(baseRequestDto);
    const token = new URL(email.sendActivationLinkEmail.mock.calls[0][0].activationUrl).searchParams.get('token')!;
    await service.verifyIdentity(token, { dateOfBirth: '1990-05-12' });
    await service.selectBranch(token, { role: 'patient' });

    await expect(service.verifyOtp(token, { code: '000000' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.verifyOtp(token, { code: '000000' })).rejects.toThrow(/locked/);
    await expect(service.verifyOtp(token, { code: '111111' })).rejects.toThrow(/Too many failed/);
  });

  it('rejects verifying an OTP that has already expired', async () => {
    const config = makeConfig({ OTP_TTL_MINUTES: -1 }); // already expired the instant it's issued
    const db = createFakeDb();
    await seedVerifiedPractice(db);
    const { service, email } = buildService(db, { config });
    await service.requestActivation(baseRequestDto);
    const token = new URL(email.sendActivationLinkEmail.mock.calls[0][0].activationUrl).searchParams.get('token')!;
    await service.verifyIdentity(token, { dateOfBirth: '1990-05-12' });
    await service.selectBranch(token, { role: 'patient' });

    await expect(service.verifyOtp(token, { code: '123456' })).rejects.toThrow(/expired/);
  });

  it('rate-limits repeated OTP resend requests', async () => {
    const config = makeConfig({ OTP_RESEND_MAX_PER_HOUR: 1 });
    const db = createFakeDb();
    await seedVerifiedPractice(db);
    const { service, email } = buildService(db, { config });
    await service.requestActivation(baseRequestDto);
    const token = new URL(email.sendActivationLinkEmail.mock.calls[0][0].activationUrl).searchParams.get('token')!;
    await service.verifyIdentity(token, { dateOfBirth: '1990-05-12' });
    await service.selectBranch(token, { role: 'patient' }); // 1st OTP send

    await expect(service.resendOtp(token)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s any step given an unknown token', async () => {
    const db = createFakeDb();
    const { service } = buildService(db);
    await expect(service.verifyIdentity('not-a-real-token', { dateOfBirth: '1990-05-12' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

function extractOtpCode(sendOtpEmailArg: { to: string; recipientFirstName: string; code: string }): string {
  return sendOtpEmailArg.code;
}
