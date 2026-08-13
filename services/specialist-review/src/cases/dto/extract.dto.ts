import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Body of `POST /cases/:id/extract`. `referralTextOverride` lets a
 * specialist re-run extraction against corrected/OCR'd text without
 * mutating the case's own stored `referralText` (which stays the original
 * source of truth) — normally omitted, in which case the stored
 * `referralText` is used.
 */
export class ExtractDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  referralTextOverride?: string;
}
