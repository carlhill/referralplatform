import { Injectable, Logger } from '@nestjs/common';

export type NotificationEventType =
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'waitlist.slot_available'
  | 'booking.escalate_to_gp';

export interface NotificationRecipient {
  principalType: 'patient' | 'carer' | 'gp' | 'specialist';
  id: string;
}

export interface SendNotificationInput {
  event: NotificationEventType;
  recipients: NotificationRecipient[];
  subject: { type: 'Booking'; id: string };
  message: string;
}

/**
 * MOCK — replace with a real call to the Notification Service
 * (`services/notification`, port 3010) once that service exposes a real
 * fan-out endpoint. As of this build, `services/notification` is still a
 * bare scaffold (health check only, no notification-sending endpoint yet —
 * see its own BUILD_LOG entry), so a `fetch()` call against it would just
 * 404; rather than pretend an integration exists, this client logs what it
 * would have sent, structured identically to what a real
 * `POST /notifications` call would carry, so swapping in the real HTTP call
 * later (per root CONVENTIONS.md §6 — plain REST + a service-to-service
 * token via packages/auth-client, no bespoke client needed beyond this one)
 * is a one-method change, not a redesign.
 *
 * Used for: the dual-notification requirements in
 * business-process-flow.md module 4 (booking confirmed writes to calendar +
 * "secure message to reception"; cancellation -> "Patient AND GP notified");
 * and waitlist auto-notify-on-open (specialist-directory-booking.md).
 */
@Injectable()
export class NotificationClient {
  private readonly logger = new Logger(NotificationClient.name);

  async send(input: SendNotificationInput): Promise<void> {
    this.logger.log(
      `[MOCK notification] ${input.event} -> ${input.recipients.map((r) => `${r.principalType}:${r.id}`).join(', ')} ` +
        `(subject=${input.subject.type}:${input.subject.id}): ${input.message}`,
    );
  }
}
