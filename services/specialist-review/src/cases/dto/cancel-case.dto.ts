import { IsOptional, IsString } from 'class-validator';

export class CancelCaseDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
