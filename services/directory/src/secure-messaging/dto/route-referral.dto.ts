import { IsBoolean, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

/**
 * Body of `POST /secure-messaging/route` — called by the Referral Service
 * once a referral is ready to send to a specialist. Exactly one of
 * `directoryEntryId`/`hpiI` must resolve to a real DirectoryEntry.
 */
export class RouteReferralDto {
  @IsString()
  @MinLength(1)
  referralId!: string;

  @IsOptional()
  @IsString()
  directoryEntryId?: string;

  @ValidateIf((o) => !o.directoryEntryId)
  @IsString()
  @MinLength(1)
  hpiI?: string;

  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  /** Routing-envelope summary only — see vendor-client.interface.ts's SecureMessageSendRequest doc. */
  @IsString()
  @MinLength(1)
  summary!: string;
}
