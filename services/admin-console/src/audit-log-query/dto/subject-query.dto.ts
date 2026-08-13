import { IsString } from 'class-validator';

export class SubjectQueryDto {
  @IsString()
  subjectType!: string;

  @IsString()
  subjectId!: string;
}
