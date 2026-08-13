import { Injectable, Logger } from '@nestjs/common';

export interface PushSendInput {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  providerMessageId: string;
}

/**
 * Abstract push-provider interface — swap `MockPushProvider` for a real
 * FCM/APNs client (or a unified provider like OneSignal/Expo push) in a
 * production environment without touching `NotificationService`'s call
 * sites. See root task brief: push is the primary channel for
 * time-sensitive events per the exception-path design
 * (minors-multigp-exception-paths.md).
 */
export abstract class PushProvider {
  abstract send(input: PushSendInput): Promise<PushSendResult>;
}

/**
 * MOCK — replace with real integration (FCM/APNs, or a unified provider).
 * No real push credentials exist for this build. "Sends" by logging the
 * notification and returning a synthetic provider message id;
 * `NotificationService` is responsible for persisting the queryable
 * `NotificationLog` row so other services/tests can assert on delivery —
 * this class only stands in for the network call to the real push gateway.
 */
@Injectable()
export class MockPushProvider extends PushProvider {
  private readonly logger = new Logger(MockPushProvider.name);

  async send(input: PushSendInput): Promise<PushSendResult> {
    const providerMessageId = `mock-push-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.logger.log(
      `[MOCK PUSH] -> token=${redactToken(input.token)} title="${input.title}" body="${input.body}" id=${providerMessageId}`,
    );
    return { providerMessageId };
  }
}

function redactToken(token: string): string {
  return token.length <= 8 ? '***' : `${token.slice(0, 4)}...${token.slice(-4)}`;
}
