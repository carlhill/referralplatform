import { ConflictException } from '@nestjs/common';
import type { ActorRef } from '@referralplatform/shared-types';
import { ComplianceRulesService, evaluateAgainstRules, matchesTrigger } from './compliance-rules.service';
import { SEED_RULES, SEED_RULESET_VERSION } from './compliance-rules.seed';
import type { ComplianceRuleRecord } from './compliance-rule-types';

class FakePrisma {
  rules = new Map<string, ComplianceRuleRecord>();
  outbox: Array<{
    type: string;
    actor: ActorRef;
    subjectType: string;
    subjectId: string;
    payload: Record<string, unknown>;
  }> = [];
  private counter = 0;

  complianceRule = {
    create: async ({ data }: { data: Partial<ComplianceRuleRecord> }) => {
      const id = `rule-${++this.counter}`;
      const now = new Date();
      const record: ComplianceRuleRecord = {
        id,
        category: data.category!,
        jurisdiction: data.jurisdiction!,
        version: data.version!,
        triggerCondition: data.triggerCondition!,
        checklistText: data.checklistText!,
        requiresWwcc: data.requiresWwcc ?? false,
        exemptForAhpraRegistered: data.exemptForAhpraRegistered ?? false,
        active: data.active ?? true,
        effectiveFrom: data.effectiveFrom ?? now,
        effectiveTo: data.effectiveTo ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.rules.set(id, record);
      return record;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<ComplianceRuleRecord> }) => {
      const existing = this.rules.get(where.id);
      if (!existing) throw new Error('not found');
      const updated = { ...existing, ...data, updatedAt: new Date() } as ComplianceRuleRecord;
      this.rules.set(where.id, updated);
      return updated;
    },
    findFirst: async ({
      where,
    }: {
      where: { id?: string; category?: string; jurisdiction?: string; version?: string; active?: boolean };
    }) => {
      const all = [...this.rules.values()].filter(
        (r) =>
          (where.id ? r.id === where.id : true) &&
          (where.category ? r.category === where.category : true) &&
          (where.jurisdiction ? r.jurisdiction === where.jurisdiction : true) &&
          (where.version ? r.version === where.version : true) &&
          (where.active !== undefined ? r.active === where.active : true),
      );
      return all[0] ?? null;
    },
    findMany: async ({ where }: { where: { active?: boolean; category?: string; jurisdiction?: unknown } }) => {
      return [...this.rules.values()].filter((r) => {
        if (where.active !== undefined && r.active !== where.active) return false;
        if (where.category && r.category !== where.category) return false;
        if (where.jurisdiction) {
          const inList = (where.jurisdiction as { in?: string[] }).in;
          if (inList && !inList.includes(r.jurisdiction)) return false;
        }
        return true;
      });
    },
  };

  auditOutbox = {
    create: async ({
      data,
    }: {
      data: { type: string; actor: ActorRef; subjectType: string; subjectId: string; payload: Record<string, unknown> };
    }) => {
      this.outbox.push(data);
      return data;
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const staffActor: ActorRef = { principalType: 'internal_staff', id: 'staff-1' };

describe('matchesTrigger / evaluateAgainstRules (pure)', () => {
  it('matches patient_is_minor only when patientIsMinor is true', () => {
    expect(
      matchesTrigger('patient_is_minor', {
        gpState: 'NSW',
        patientIsMinor: true,
        dvIndicated: false,
        complexCase: false,
      }),
    ).toBe(true);
    expect(
      matchesTrigger('patient_is_minor', {
        gpState: 'NSW',
        patientIsMinor: false,
        dvIndicated: false,
        complexCase: false,
      }),
    ).toBe(false);
  });

  it('an unknown trigger condition never matches', () => {
    expect(
      matchesTrigger('something_else', { gpState: 'NSW', patientIsMinor: true, dvIndicated: true, complexCase: true }),
    ).toBe(false);
  });

  it('filters rules by active, jurisdiction (state or ALL), and trigger', () => {
    const rules: ComplianceRuleRecord[] = [
      {
        id: '1',
        category: 'child',
        jurisdiction: 'ALL',
        version: '1',
        triggerCondition: 'patient_is_minor',
        checklistText: '',
        requiresWwcc: false,
        exemptForAhpraRegistered: false,
        active: true,
        effectiveFrom: new Date(),
        effectiveTo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        category: 'working_with_children_check',
        jurisdiction: 'NSW',
        version: '1',
        triggerCondition: 'patient_is_minor',
        checklistText: '',
        requiresWwcc: true,
        exemptForAhpraRegistered: false,
        active: true,
        effectiveFrom: new Date(),
        effectiveTo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '3',
        category: 'working_with_children_check',
        jurisdiction: 'VIC',
        version: '1',
        triggerCondition: 'patient_is_minor',
        checklistText: '',
        requiresWwcc: false,
        exemptForAhpraRegistered: true,
        active: true,
        effectiveFrom: new Date(),
        effectiveTo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '4',
        category: 'complex',
        jurisdiction: 'ALL',
        version: '1',
        triggerCondition: 'complex_case_flag',
        checklistText: '',
        requiresWwcc: false,
        exemptForAhpraRegistered: false,
        active: false,
        effectiveFrom: new Date(),
        effectiveTo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const matched = evaluateAgainstRules(rules, {
      gpState: 'NSW',
      patientIsMinor: true,
      dvIndicated: false,
      complexCase: true,
    });
    // '1' (ALL, minor) and '2' (NSW, minor) match; '3' is VIC-only so excluded; '4' is inactive.
    expect(matched.map((r) => r.id).sort()).toEqual(['1', '2']);
  });
});

describe('ComplianceRulesService', () => {
  let prisma: FakePrisma;
  let service: ComplianceRulesService;

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new ComplianceRulesService(prisma as any);
  });

  it('seedDefaults() inserts every seed rule exactly once', async () => {
    const first = await service.seedDefaults();
    expect(first).toBe(SEED_RULES.length);
    const second = await service.seedDefaults();
    expect(second).toBe(0); // idempotent
    expect(prisma.rules.size).toBe(SEED_RULES.length);
  });

  it('seeds the real state-by-state WWCC data correctly', async () => {
    await service.seedDefaults();
    const wwcc = [...prisma.rules.values()].filter((r) => r.category === 'working_with_children_check');
    const requiredStates = wwcc
      .filter((r) => r.requiresWwcc)
      .map((r) => r.jurisdiction)
      .sort();
    const exemptStates = wwcc
      .filter((r) => !r.requiresWwcc)
      .map((r) => r.jurisdiction)
      .sort();
    expect(requiredStates).toEqual(['NSW', 'NT', 'SA', 'TAS']);
    expect(exemptStates).toEqual(['ACT', 'QLD', 'VIC', 'WA']);
  });

  it('evaluate() returns the WWCC rule + child rule for a minor patient in NSW', async () => {
    await service.seedDefaults();
    const matched = await service.evaluate({
      gpState: 'NSW' as any,
      patientIsMinor: true,
      dvIndicated: false,
      complexCase: false,
    });
    expect(matched.some((r) => r.category === 'child')).toBe(true);
    expect(
      matched.some((r) => r.category === 'working_with_children_check' && r.jurisdiction === 'NSW' && r.requiresWwcc),
    ).toBe(true);
    expect(matched).toHaveLength(2);
  });

  it('evaluate() for a minor patient in QLD returns the WWCC-exempt rule, not a requiring one', async () => {
    await service.seedDefaults();
    const matched = await service.evaluate({
      gpState: 'QLD' as any,
      patientIsMinor: true,
      dvIndicated: false,
      complexCase: false,
    });
    const wwccFlag = matched.find((r) => r.category === 'working_with_children_check');
    expect(wwccFlag?.jurisdiction).toBe('QLD');
    expect(wwccFlag?.requiresWwcc).toBe(false);
    expect(wwccFlag?.exemptForAhpraRegistered).toBe(true);
  });

  it('evaluate() returns nothing when no trigger conditions are met', async () => {
    await service.seedDefaults();
    const matched = await service.evaluate({
      gpState: 'VIC' as any,
      patientIsMinor: false,
      dvIndicated: false,
      complexCase: false,
    });
    expect(matched).toHaveLength(0);
  });

  it('evaluate() returns the DV rule when dvIndicated is set, and complex rule when complexCase is set', async () => {
    await service.seedDefaults();
    const dv = await service.evaluate({
      gpState: 'VIC' as any,
      patientIsMinor: false,
      dvIndicated: true,
      complexCase: false,
    });
    expect(dv.map((r) => r.category)).toEqual(['domestic_violence']);

    const complex = await service.evaluate({
      gpState: 'VIC' as any,
      patientIsMinor: false,
      dvIndicated: false,
      complexCase: true,
    });
    expect(complex.map((r) => r.category)).toEqual(['complex']);
  });

  it('createNewVersion() supersedes the current active rule and audits it', async () => {
    await service.seedDefaults();
    const currentNsw = await service.evaluate({
      gpState: 'NSW' as any,
      patientIsMinor: true,
      dvIndicated: false,
      complexCase: false,
    });
    const currentWwcc = currentNsw.find((r) => r.category === 'working_with_children_check')!;

    const created = await service.createNewVersion(
      {
        category: 'working_with_children_check',
        jurisdiction: 'NSW',
        version: '1.1.0',
        triggerCondition: 'patient_is_minor',
        checklistText: 'Updated NSW WWCC guidance',
        requiresWwcc: true,
        exemptForAhpraRegistered: false,
      },
      staffActor,
    );

    expect(created.version).toBe('1.1.0');
    const superseded = prisma.rules.get(currentWwcc.id)!;
    expect(superseded.active).toBe(false);
    expect(superseded.effectiveTo).not.toBeNull();
    expect(prisma.outbox.some((e) => (e.payload as any).event === 'compliance_rule.published')).toBe(true);

    // The new version is now what evaluate() returns; the old version stays a historical row.
    const afterMatch = await service.evaluate({
      gpState: 'NSW' as any,
      patientIsMinor: true,
      dvIndicated: false,
      complexCase: false,
    });
    const wwccAfter = afterMatch.find((r) => r.category === 'working_with_children_check')!;
    expect(wwccAfter.version).toBe('1.1.0');
  });

  it('createNewVersion() refuses to publish a duplicate (category, jurisdiction, version)', async () => {
    await service.seedDefaults();
    await expect(
      service.createNewVersion(
        {
          category: 'working_with_children_check',
          jurisdiction: 'NSW',
          version: SEED_RULESET_VERSION,
          triggerCondition: 'patient_is_minor',
          checklistText: 'duplicate',
          requiresWwcc: true,
        },
        staffActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('listActive() filters by category and includes jurisdiction=ALL rows alongside a specific state', async () => {
    await service.seedDefaults();
    const nswRules = await service.listActive('working_with_children_check', 'NSW');
    expect(nswRules).toHaveLength(1);
    expect(nswRules[0].jurisdiction).toBe('NSW');

    const childRules = await service.listActive('child');
    expect(childRules).toHaveLength(1);
    expect(childRules[0].jurisdiction).toBe('ALL');
  });
});
