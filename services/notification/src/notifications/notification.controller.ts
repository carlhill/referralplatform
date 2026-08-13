import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { SendPushDto } from './dto/send-push.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { DispatchNotificationDto } from './dto/dispatch-notification.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications.query.dto';
import { BearerAuthGuard } from '../common/bearer-auth.guard';

/**
 * Notification Service HTTP API — module #13 of modules-and-requirements.md.
 * Called by every other service in the platform to fan out push/SMS/email;
 * `/dispatch` is the recommended entry point for anything following the
 * exception-path design's dual-notification pattern (push primary,
 * email/SMS fallback). `GET /notifications` lets other services/tests
 * assert on what was actually sent, per the task brief.
 *
 * Authenticated with the same service-to-service bearer-token pattern
 * every other service uses (root CONVENTIONS.md §8) — any authenticated
 * principal (typically a `system` service-to-service token, but a
 * patient/GP/specialist token is equally valid, e.g. registering their own
 * device) may call these endpoints. Fine-grained "who is allowed to notify
 * whom" is left to the calling service, consistent with this service being
 * a transport layer, not a policy-decision point.
 */
@Controller('notifications')
@UseGuards(BearerAuthGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Post('devices')
  async registerDevice(@Body() dto: RegisterDeviceDto) {
    return this.notifications.registerDevice(dto);
  }

  @Post('push')
  async sendPush(@Body() dto: SendPushDto) {
    return this.notifications.sendPush(dto);
  }

  @Post('sms')
  async sendSms(@Body() dto: SendSmsDto) {
    return this.notifications.sendSms(dto);
  }

  @Post('email')
  async sendEmail(@Body() dto: SendEmailDto) {
    return this.notifications.sendEmail(dto);
  }

  @Post('dispatch')
  async dispatch(@Body() dto: DispatchNotificationDto) {
    return this.notifications.dispatch(dto);
  }

  @Get()
  async list(@Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.notifications.getById(id);
  }
}
