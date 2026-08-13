import { IsIn, IsOptional, IsString } from 'class-validator';
import { GP_LINK_STATUSES, type GpLinkStatus } from '../gp-link-status';

export class ListGpLinksQueryDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  gpId?: string;

  @IsOptional()
  @IsIn(GP_LINK_STATUSES)
  status?: GpLinkStatus;
}
