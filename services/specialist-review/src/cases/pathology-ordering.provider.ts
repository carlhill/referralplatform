import { Injectable, Logger } from '@nestjs/common';

export interface PathologyOrderRequest {
  caseId: string;
  requestType: 'pathology' | 'imaging';
  testsRequested: string[];
  clinicalNotes?: string;
}

export interface PathologyOrderResult {
  /** A fake reference id — NEVER a real lab/HealthLink message id, see class doc comment. */
  providerReference: string;
}

/** Clean interface a real e-ordering integration implements — see MockPathologyOrderingProvider below. */
export interface PathologyOrderingProvider {
  readonly name: string;
  submit(order: PathologyOrderRequest): Promise<PathologyOrderResult>;
}

/** DI token — CasesService depends on this, not the concrete Mock class, so a real provider is a drop-in swap. */
export const PATHOLOGY_ORDERING_PROVIDER = Symbol('PATHOLOGY_ORDERING_PROVIDER');

/**
 * MOCK — replace with real integration.
 *
 * Real pre-visit pathology/imaging e-ordering (module 5's "S5: Specialist
 * may request pre-visit pathology/imaging via e-ordering") requires a real
 * secure-messaging-vendor account — HealthLink or Medical-Objects, the same
 * two vendors the platform-wide Secure Messaging Gateway module (module #8,
 * modules-and-requirements.md) integrates with, per
 * patient-centered-recall-ai-intake.md's "platform originates the request…
 * routes it through one of the existing secure messaging rails" design.
 * Nobody has issued this build a HealthLink/Medical-Objects account, so
 * there is nothing real to call — this mock exists purely to give
 * CasesService a real, working seam to call today, and to make the
 * eventual real integration a drop-in replacement of this one class rather
 * than a redesign of PathologyImagingRequest's schema or CasesService's
 * logic.
 *
 * A real implementation would: build an HL7v2/FHIR ServiceRequest message
 * from `order`, authenticate to the vendor's gateway with the practice's
 * NASH-issued certificate (see fhir-gateway's NASH signing responsibility),
 * transmit it, and return the vendor's real message id as
 * `providerReference` — at which point `PathologyImagingRequest.status`
 * would progress `requested -> sent` on submission and `-> resulted` once
 * the Follow-up & Recall Service's pathology-result detection
 * (patient-centered-recall-ai-intake.md Layer 2) observes a matching
 * result.
 */
@Injectable()
export class MockPathologyOrderingProvider implements PathologyOrderingProvider {
  readonly name = 'mock-e-ordering-v1';
  private readonly logger = new Logger(MockPathologyOrderingProvider.name);
  private counter = 0;

  async submit(order: PathologyOrderRequest): Promise<PathologyOrderResult> {
    this.counter += 1;
    const providerReference = `MOCK-${order.requestType.toUpperCase()}-${Date.now()}-${this.counter}`;
    this.logger.log(
      `MOCK e-ordering: recorded a fake ${order.requestType} request for case ${order.caseId} ` +
        `(${order.testsRequested.join(', ')}) as ${providerReference} — no real message was sent to any vendor.`,
    );
    return { providerReference };
  }
}
