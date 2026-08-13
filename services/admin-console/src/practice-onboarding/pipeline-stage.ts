/**
 * PHN/practice onboarding pipeline — ui-design.md's "Admin/Ops Console"
 * screen 3. Referenced by prisma/schema.prisma's PracticeOnboardingCase doc
 * comment ("see pipeline-stage.ts for the allowed transitions").
 *
 * Mirrors, in staff-tracked pipeline-stage form, the real registration
 * lifecycle onboarding-account's `GpPractice` record goes through (HPI-O
 * verification, compliance-checklist acknowledgement) plus the
 * pre-registration stages that have no home in that service at all (a lead
 * that hasn't registered yet has no `GpPractice.id` to attach to).
 */
export const PIPELINE_STAGES = [
  'lead',
  'contacted',
  'registered',
  'hpio_verification_pending',
  'hpio_verified',
  'hpio_verification_failed',
  'compliance_checklist_pending',
  'compliance_checklist_acknowledged',
  'live',
  'stalled',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * The forward "happy path" plus the two exception branches
 * (`hpio_verification_failed` → retry, and `stalled` from any non-terminal
 * stage → resume from `contacted`). `live` is terminal — a practice that
 * needs to be taken offline again is an operational action outside this
 * pipeline-tracking model's scope, not a stage transition (documented
 * judgment call; see BUILD_LOG/admin-console.md).
 */
const ALLOWED_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  lead: ['contacted', 'stalled'],
  contacted: ['registered', 'stalled'],
  registered: ['hpio_verification_pending', 'stalled'],
  hpio_verification_pending: ['hpio_verified', 'hpio_verification_failed', 'stalled'],
  hpio_verification_failed: ['hpio_verification_pending', 'stalled'],
  hpio_verified: ['compliance_checklist_pending', 'stalled'],
  compliance_checklist_pending: ['compliance_checklist_acknowledged', 'stalled'],
  compliance_checklist_acknowledged: ['live', 'stalled'],
  live: [],
  stalled: ['contacted'],
};

export function isValidTransition(from: string, to: string): boolean {
  const allowed = ALLOWED_TRANSITIONS[from as PipelineStage];
  return Array.isArray(allowed) && allowed.includes(to as PipelineStage);
}

export function allowedNextStages(from: string): PipelineStage[] {
  return ALLOWED_TRANSITIONS[from as PipelineStage] ?? [];
}
