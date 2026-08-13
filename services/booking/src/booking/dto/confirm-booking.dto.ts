import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmBookingDto {
  @IsString()
  @IsNotEmpty()
  slotId!: string;
}
