import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { REQUESTER_RELATIONSHIPS } from '../state-eligibility';

const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;

/** Body of `POST /deceased-flags/:patientId/access-requests` — never self-service; always lands in the human-reviewed queue. */
export class SubmitAccessRequestDto {
  @IsString()
  @MinLength(1)
  requesterName!: string;

  @IsOptional()
  @IsString()
  requesterEmail?: string;

  @IsOptional()
  @IsString()
  requesterPhone?: string;

  @IsIn(REQUESTER_RELATIONSHIPS)
  requesterRelationship!: (typeof REQUESTER_RELATIONSHIPS)[number];

  @IsIn(AUSTRALIAN_STATES)
  state!: (typeof AUSTRALIAN_STATES)[number];

  /** Free-text description of the evidence held (grant of probate, letters of administration, coroner's/police request) — the document itself is uploaded separately to the document vault and referenced by evidenceDocumentId. */
  @IsOptional()
  @IsString()
  evidenceDescription?: string;

  @IsOptional()
  @IsString()
  evidenceDocumentId?: string;
}
