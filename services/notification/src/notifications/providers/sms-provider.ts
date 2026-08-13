import { Injectable, Logger } from '@nestjs/common';

export interface SmsSendInput {
  to: string; // E.164 phone number
  message: string;
}

export interface SmsSendResult {
  providerMessageId: string;
}

/**
 * Abstract SMS-provider interface — swap `MockSmsProvider` for a real
 * vendor (Twilio, MessageMedia, ...) once a paid account exists. Every
 * call site in this service goes through this interface, never a
 * vendor-specific SDK call directly.
 */
export abstract class SmsProvider {
  abstract send(input: SmsSendInput): Promise<SmsSendResult>;
}

/**
 * MOCK — replace with real integration. No paid SMS account exists for
 * this build (see modules-and-requirements.md: "the SMS provider is a
 * mock (no paid account exists)"). "Sends" by logging the message and
 * returning a synthetic provider message id; `NotificationService`
 * persists the queryable `NotificationLog` row.
 */
@Injectable()
export class MockSmsProvider extends SmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const providerMessageId = `mock-sms-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.logger.log(`[MOCK SMS] -> to=${redactPhone(input.to)} message="${input.message}" id=${providerMessageId}`);
    return { providerMessageId };
  }
}

function redactPhone(phone: string): string {
  return phone.length <= 4 ? '***' : `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
}
