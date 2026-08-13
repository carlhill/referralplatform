import { Transform } from 'class-transformer';
import { IsBooleanString, IsIn, IsOptional, IsString } from 'class-validator';

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;

/** Query params for `GET /directory/entries` — Postgres full-text/ILIKE search, per solution-architecture-tech-stack.md's "Postgres full-text search (initially)" for directory search. */
export class SearchDirectoryQueryDto {
  /** Free-text match against displayName/subspecialty. */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  subspecialty?: string;

  @IsOptional()
  @IsIn(AU_STATES)
  state?: (typeof AU_STATES)[number];

  @IsOptional()
  @IsBooleanString()
  acceptsBookingsViaPlatform?: string;

  @IsOptional()
  @IsBooleanString()
  econsultOptIn?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  offset?: number;
}
