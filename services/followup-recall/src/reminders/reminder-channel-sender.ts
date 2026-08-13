import { Injectable, Logger } from '@nestjs/common';
import type { ReminderChannel, ReminderRecipientType } from '../follow-up-plans/follow-up-plan-status';

export interface ReminderSendRequest {
  reminderId: string;
  followUpPlanId: string;
  patientId: string;
  recipientType: ReminderRecipientType;
  channel: ReminderChannel;
  escalationLevel: number;
  /** Plain-language body — the caller (ReminderDispatchScheduler) composes this from the plan. */
  message: string;
}

export interface ReminderSendResult {
  delivered: boolean;
  providerMessageId?: string;
  failureReason?: string;
}

/**
 * MOCK — replace with real integration.
 *
 * Sending an actual SMS/email/push/secure-message requires a real-world
 * vendor and credentials this build does not have (an SMS gateway like
 * Twilio/MessageMedia, an SMTP/SES provider, an FCM/APNs push credential,
 * or — once services/notification exists as more than a health-check
 * skeleton — that service's own outbound integrations). Per this task's
 * ground rules, that's implemented behind this clean interface with a
 * working mock, not faked as a real integration.
 *
 * Why this lives in followup-recall rather than calling out to
 * services/notification over HTTP: at the time this was built,
 * services/notification (port 3010) had no real endpoints yet — only the
 * scaffold's `GET /health` (see `services/notification/src/*` — no
 * BUILD_LOG entry exists for it). Root CONVENTIONS.md §6 doesn't ask a
 * service to design and implement another team's HTTP contract for them
 * speculatively. This interface is deliberately shaped so that once
 * services/notification has a real `POST /notifications/send`-style
 * endpoint, swapping this MOCK implementation for an
 * `HttpNotificationChannelSender` that calls it is a drop-in change — no
 * caller of `ReminderChannelSender` needs to change.
 *
 * The mock is deterministic and side-effect-free (logs only) so unit tests
 * and local runs are reproducible; it never actually reaches a phone,
 * inbox, or device.
 */
export interface ReminderChannelSender {
  send(request: ReminderSendRequest): Promise<ReminderSendResult>;
}

@Injectable()
export class MockReminderChannelSender implements ReminderChannelSender {
  private readonly logger = new Logger(MockReminderChannelSender.name);

  async send(request: ReminderSendRequest): Promise<ReminderSendResult> {
    // MOCK — replace with real integration (SMS gateway / SMTP / push
    // provider, or a real call into services/notification once it exists).
    this.logger.log(
      `[MOCK ${request.channel.toUpperCase()}] to=${request.recipientType} patient=${request.patientId} ` +
        `plan=${request.followUpPlanId} escalationLevel=${request.escalationLevel}: "${request.message}"`,
    );
    return { delivered: true, providerMessageId: `mock-${request.channel}-${request.reminderId}` };
  }
}
