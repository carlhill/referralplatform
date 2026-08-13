import { IsString } from 'class-validator';

export class QueryAuditEventsDto {
  @IsString()
  subjectType!: string;

  @IsString()
  subjectId!: string;
}
