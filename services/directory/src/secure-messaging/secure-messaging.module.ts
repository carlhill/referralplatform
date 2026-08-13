import { Module } from '@nestjs/common';
import { SecureMessagingController } from './secure-messaging.controller';
import { SecureMessagingService } from './secure-messaging.service';
import { HEALTHLINK_CLIENT, MEDICAL_OBJECTS_CLIENT, DIRECT_DELIVERY_CLIENT } from './vendors/vendor-client.interface';
import { MockHealthLinkClient } from './vendors/mock-healthlink-client';
import { MockMedicalObjectsClient } from './vendors/mock-medical-objects-client';
import { MockDirectDeliveryClient } from './vendors/mock-direct-delivery-client';

@Module({
  controllers: [SecureMessagingController],
  providers: [
    SecureMessagingService,
    { provide: HEALTHLINK_CLIENT, useClass: MockHealthLinkClient },
    { provide: MEDICAL_OBJECTS_CLIENT, useClass: MockMedicalObjectsClient },
    { provide: DIRECT_DELIVERY_CLIENT, useClass: MockDirectDeliveryClient },
  ],
  exports: [SecureMessagingService],
})
export class SecureMessagingModule {}
