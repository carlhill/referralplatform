import { IsOptional, IsString } from 'class-validator';

export class ResolveThreadDto {
  @IsOptional()
  @IsString()
  note?: string;
}
