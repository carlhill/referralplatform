import { Module } from '@nestjs/common';
import { ReattestationsController } from './reattestations.controller';
import { ReattestationsService } from './reattestations.service';

@Module({
  controllers: [ReattestationsController],
  providers: [ReattestationsService],
})
export class ReattestationsModule {}
