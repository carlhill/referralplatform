import { IsNotEmpty, IsString } from 'class-validator';

export class PostMessageDto {
  @IsString()
  @IsNotEmpty()
  body!: string;
}
