import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Raised when a routing attempt exhausts delivery (the vendor/direct-delivery
 * client threw) — "must not silently fail a routed referral," per
 * modules-and-requirements.md. This is a real, typed HTTP exception (502 Bad
 * Gateway — the failure is in a downstream dependency, not this service's
 * own request handling), not a `{ ok: false }` response a caller could
 * accidentally ignore. `SecureMessagingService` also, before throwing this:
 *  1. records the failed `RoutingAttempt` (queryable/retryable, not lost);
 *  2. writes a `referral.routed` audit outbox row with `payload.status =
 *     'failed'` (an auditable event, not a silent one);
 *  3. best-effort notifies the Notification Service so the dual-notification
 *     exception path (GP + patient/staff) can fire — see
 *     SecureMessagingService.notifyDeliveryFailure.
 */
export class SecureMessagingDeliveryException extends HttpException {
  constructor(
    public readonly referralId: string,
    public readonly vendor: string,
    public readonly routingAttemptId: string,
    reason: string,
  ) {
    super(
      {
        error: 'SecureMessagingDeliveryFailed',
        message: `Failed to route referral ${referralId} via ${vendor}: ${reason}`,
        referralId,
        vendor,
        routingAttemptId,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}
