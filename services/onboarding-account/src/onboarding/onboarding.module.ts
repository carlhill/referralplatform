import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { HiServiceModule } from '../hi-service/hi-service.module';
import { NotificationModule } from '../notification/notification.module';
import { IdentityAccessClientModule } from '../identity-access-client/identity-access-client.module';
import { AuditOutboxModule } from '../audit-outbox/audit-outbox.module';

@Module({
  imports: [HiServiceModule, NotificationModule, IdentityAccessClientModule, AuditOutboxModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
