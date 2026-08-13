import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator';

const REQUEST_TYPES = ['pathology', 'imaging'];

/** Body of `POST /cases/:id/pathology-requests` — module 5's pre-visit pathology/imaging e-ordering. */
export class PathologyRequestDto {
  @IsIn(REQUEST_TYPES)
  requestType!: 'pathology' | 'imaging';

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  testsRequested!: string[];

  @IsOptional()
  @IsString()
  clinicalNotes?: string;
}
