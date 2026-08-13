import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

class ThreadParticipantDto {
  @IsIn(['patient', 'carer', 'gp', 'specialist', 'internal_staff', 'system'])
  principalType!: string;

  @IsString()
  principalId!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class CreateThreadDto {
  @IsOptional()
  @IsString()
  subject?: string;

  /** Other known parties to add at creation time, in addition to the caller. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ThreadParticipantDto)
  participants?: ThreadParticipantDto[];

  @IsOptional()
  @IsString()
  initialMessage?: string;
}
