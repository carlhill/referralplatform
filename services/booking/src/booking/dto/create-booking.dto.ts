import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_BANDS = ['morning', 'afternoon', 'evening'];

/**
 * Preference capture + urgent fast-path — business-process-flow.md module
 * 4's entry point. `urgentFastPath` bypasses preference negotiation
 * entirely (see BookingService.create), so `preferredDayOfWeek`/
 * `preferredTimeOfDay` are ignored (not validated as required) when it's
 * set — matching "skips booking preference negotiation" from
 * business-process-flow.md's v2 changelog.
 */
export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  referralId!: string;

  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @IsString()
  @IsNotEmpty()
  specialistId!: string;

  @IsOptional()
  @IsBoolean()
  urgentFastPath?: boolean;

  @IsOptional()
  @IsIn(DAY_NAMES)
  preferredDayOfWeek?: string;

  @IsOptional()
  @IsIn(TIME_BANDS)
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
}
