import { IsBoolean } from 'class-validator';

/**
 * A genuinely separate decision from "will you take bookings through this
 * platform" — see onboarding-processes.md step 6: "some specialists may
 * want one without the other."
 */
export class EconsultOptInDto {
  @IsBoolean()
  optIn!: boolean;
}
