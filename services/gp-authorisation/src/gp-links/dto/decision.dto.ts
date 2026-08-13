import { IsOptional, IsString } from 'class-validator';

/** Body of POST /gp-links/:id/decline and POST /gp-links/:id/revoke. */
export class DecisionReasonDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
