import { IsString, MinLength } from 'class-validator';

export class ResolveConcernDto {
  @IsString()
  @MinLength(1)
  resolutionNote!: string;
}
