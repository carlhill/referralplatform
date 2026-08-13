import { IsString, MinLength } from 'class-validator';

/** Body of `POST /cases/:id/extractions/:extractionId/reject` — e.g. the source text was garbled/unusable. */
export class RejectExtractionDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
