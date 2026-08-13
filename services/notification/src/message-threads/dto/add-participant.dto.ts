import { IsIn, IsOptional, IsString } from 'class-validator';

export class AddParticipantDto {
  @IsIn(['patient', 'carer', 'gp', 'specialist', 'internal_staff', 'system'])
  principalType!: string;

  @IsString()
  principalId!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}
