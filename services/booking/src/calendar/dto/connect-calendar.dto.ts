import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { CalendarProvider } from '../calendar-client.interface';

export class ConnectCalendarDto {
  @IsString()
  @IsNotEmpty()
  specialistId!: string;

  @IsIn(['google', 'outlook', 'caldav'])
  provider!: CalendarProvider;

  /** Opaque calendar handle — a calendar id (Google/Outlook) or feed URL (CalDAV). Never a raw secret — see schema.prisma's doc comment. */
  @IsString()
  @IsNotEmpty()
  externalCalendarId!: string;
}
