import { IsString } from 'class-validator';

/** MOCK — replace with real integration. Standard OIDC token-endpoint request body (application/x-www-form-urlencoded). */
export class TokenRequestDto {
  @IsString()
  grant_type!: string;

  @IsString()
  code!: string;

  @IsString()
  redirect_uri!: string;

  @IsString()
  client_id!: string;

  @IsString()
  client_secret!: string;
}
