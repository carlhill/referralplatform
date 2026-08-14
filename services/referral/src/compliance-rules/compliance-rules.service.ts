import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ActorRef, AuditEventType } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { SEED_RULES } from './compliance-rules.seed';
import type { ComplianceEvaluationInput, ComplianceRuleRecord } from './compliance-rule-types';
import { CreateComplianceRuleDto } from './dto/create-compliance-rule.dto';

interface OutboxRow {
  type: AuditEventType;
  actor: ActorRef;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

/** The minimal shape this service needs from Prisma — kept narrow so unit tests can fake it easily. */
interface RulesTxClient {
  complianceRule: {
    findMany: (args: any) => Promise<ComplianceRuleRecord[]>;
    create: (args: any) => Promise<ComplianceRuleRecord>;
    update: (args: any) => Promise<ComplianceRuleRecord>;
    findFirst: (args: any) => Promise<ComplianceRuleRecord | null>;
  };
  auditOutbox: {
    create: (args: any) => Promise<unknown>;
  };
}

/**
 * Pure matching logic — a rule fires when it's `active`, its jurisdiction is
 * either "ALL" or exactly the treating GP's state, and its
 * `triggerCondition` is satisfied by the evaluation input. Exported
 * separately from the DB-backed service so it's trivially unit-testable
 * without a Prisma fake (see compliance-rules.service.spec.ts).
 */
export function matchesTrigger(triggerCondition: string, input: ComplianceEvaluationInput): boolean {
  switch (triggerCondition) {
    case 'patient_is_minor':
      return input.patientIsMinor;
    case 'dv_indicated':
      return input.dvIndicated;
    case 'complex_case_flag':
      return input.complexCase;
    default:
      return false;
  }
}

export function evaluateAgainstRules(
  rules: ComplianceRuleRecord[],
  input: ComplianceEvaluationInput,
): ComplianceRuleRecord[] {
  return rules.filter(
    (rule) =>
      rule.active &&
      (rule.jurisdiction === 'ALL' || rule.jurisdiction === input.gpState) &&
      matchesTrigger(rule.triggerCondition, input),
  );
}

/**
 * Compliance Rules Engine — module #6 of modules-and-requirements.md. A
 * DATA-DRIVEN rules layer (rules stored as versioned rows, never hardcoded
 * conditionals in application code) covering the child/DV/complex flags and
 * state-by-state Working with Children Check applicability, per
 * minors-multigp-exception-paths.md section 1.
 *
 * Rules are never mutated in place once created — `createNewVersion` closes
 * the current active row for a (category, jurisdiction) pair and inserts a
 * new one, so a referral created under an old ruleset stays auditable
 * against exactly the rule text/config that applied at the time (its
 * ComplianceFlag rows freeze `rulesetVersion`), even after compliance staff
 * edit the live rules.
 */
@Injectable()
export class ComplianceRulesService {
  private readonly logger = new Logger(ComplianceRulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently seeds the real WWCC/child/DV/complex rule data from
   * compliance-rules.seed.ts — upserts on the (category, jurisdiction,
   * version) unique key, so calling this repeatedly (on every service boot)
   * never duplicates rows or clobbers a rule compliance staff have since
   * superseded with a newer version.
   */
  async seedDefaults(): Promise<number> {
    let seeded = 0;
    for (const rule of SEED_RULES) {
      const existing = await this.prisma.complianceRule.findFirst({
        where: { category: rule.category, jurisdiction: rule.jurisdiction, version: rule.version },
      });
      if (existing) {
        continue;
      }
      await this.prisma.complianceRule.create({ data: rule });
      seeded += 1;
    }
    if (seeded > 0) {
      this.logger.log(`Seeded ${seeded} compliance rule(s)`);
    }
    return seeded;
  }

  async listActive(category?: string, jurisdiction?: string): Promise<ComplianceRuleRecord[]> {
    return this.prisma.complianceRule.findMany({
      where: {
        active: true,
        ...(category ? { category } : {}),
        ...(jurisdiction ? { jurisdiction: { in: [jurisdiction, 'ALL'] } } : {}),
      },
      orderBy: [{ category: 'asc' }, { jurisdiction: 'asc' }],
    });
  }

  /** Used by ReferralService at referral-creation time to decide which ComplianceFlags to raise. */
  async evaluate(input: ComplianceEvaluationInput): Promise<ComplianceRuleRecord[]> {
    const candidates = await this.prisma.complianceRule.findMany({
      where: { active: true, jurisdiction: { in: [input.gpState, 'ALL'] } },
    });
    return evaluateAgainstRules(candidates, input);
  }

  /**
   * Admin-only: publishes a new version of a rule (root CONVENTIONS.md §8 —
   * gate this at the controller to `internal_staff`). Closes the currently
   * active row for the same (category, jurisdiction) pair, if any, and
   * inserts the new one — both in one transaction, both audited.
   */
  async createNewVersion(dto: CreateComplianceRuleDto, actor: ActorRef): Promise<ComplianceRuleRecord> {
    const current = await this.prisma.complianceRule.findFirst({
      where: { category: dto.category, jurisdiction: dto.jurisdiction, active: true },
    });
    if (current && current.version === dto.version) {
      throw new ConflictException(
        `A rule for category=${dto.category} jurisdiction=${dto.jurisdiction} already exists at version ${dto.version}`,
      );
    }

    return this.prisma.$transaction(async (tx: RulesTxClient) => {
      const now = new Date();
      if (current) {
        await tx.complianceRule.update({ where: { id: current.id }, data: { active: false, effectiveTo: now } });
      }
      const created = await tx.complianceRule.create({
        data: {
          category: dto.category,
          jurisdiction: dto.jurisdiction,
          version: dto.version,
          triggerCondition: dto.triggerCondition,
          checklistText: dto.checklistText,
          requiresWwcc: dto.requiresWwcc ?? false,
          exemptForAhpraRegistered: dto.exemptForAhpraRegistered ?? false,
          active: true,
          effectiveFrom: now,
        },
      });
      await this.writeOutbox(tx, {
        // shared-types' AuditEventType has no dedicated "compliance rule
        // published" variant — see BUILD_LOG/referral.md for this judgment
        // call (reusing the closest available type, same precedent as
        // BUILD_LOG/gp-authorisation.md's handling of link expiry).
        type: 'access.request.granted',
        actor,
        subjectType: 'ComplianceRule',
        subjectId: created.id,
        payload: {
          event: 'compliance_rule.published',
          category: created.category,
          jurisdiction: created.jurisdiction,
          version: created.version,
          supersededRuleId: current?.id ?? null,
        },
      });
      return created;
    });
  }

  async getById(id: string): Promise<ComplianceRuleRecord> {
    const found = await this.prisma.complianceRule.findFirst({ where: { id } });
    if (!found) {
      throw new NotFoundException(`ComplianceRule ${id} not found`);
    }
    return found;
  }

  private async writeOutbox(tx: RulesTxClient, row: OutboxRow): Promise<void> {
    await tx.auditOutbox.create({
      data: {
        type: row.type,
        actor: row.actor as unknown as object,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        payload: row.payload as unknown as object,
      },
    });
  }
}
