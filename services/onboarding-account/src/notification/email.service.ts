import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendActivationLinkEmailInput {
  to: string;
  patientFirstName: string;
  activationUrl: string;
  expiresAt: Date;
}

export interface SendOtpEmailInput {
  to: string;
  recipientFirstName: string;
  code: string;
  expiresAt: Date;
}

/**
 * Sends onboarding emails (activation link, OTP) via SMTP. In every
 * environment configured by this repo's `docker-compose.yml` and
 * `.env.example`, that SMTP server is Mailhog (`SMTP_HOST=mailhog`,
 * `SMTP_PORT=1025`) — a real, working SMTP send, just to a local
 * mail-catcher instead of a real inbox, per modules-and-requirements.md:
 * "the SMS provider is a mock ... the OTP/account-activation channel runs
 * on real email delivery instead so onboarding is actually testable
 * end-to-end." Swapping in a real transactional-email provider (SES,
 * SendGrid, ...) for production is a `nodemailer.createTransport(...)`
 * config change, not a redesign — every call site here goes through this
 * one service.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: this.config.get<number>('SMTP_PORT', 1025),
      secure: false,
      // Mailhog needs no auth; a real provider's credentials would go here
      // via SMTP_USER/SMTP_PASSWORD env vars once one is configured.
      ...(this.config.get<string>('SMTP_USER')
        ? { auth: { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASSWORD') } }
        : {}),
    });
    this.fromAddress = this.config.get<string>('EMAIL_FROM', 'no-reply@referralplatform.example.au');
  }

  async sendActivationLinkEmail(input: SendActivationLinkEmailInput): Promise<void> {
    const expiry = input.expiresAt.toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' });
    await this.send({
      to: input.to,
      subject: 'Set up your ReferralPlatform account',
      text:
        `Hi ${input.patientFirstName},\n\n` +
        `Your GP has requested a ReferralPlatform account be set up so your referral can be sent securely.\n\n` +
        `Set up your account: ${input.activationUrl}\n\n` +
        `This link expires ${expiry}. If you didn't expect this, you can safely ignore this email — ` +
        `no account will be created.\n\nReferralPlatform`,
      html:
        `<p>Hi ${escapeHtml(input.patientFirstName)},</p>` +
        `<p>Your GP has requested a ReferralPlatform account be set up so your referral can be sent securely.</p>` +
        `<p><a href="${escapeHtml(input.activationUrl)}">Set up your account</a></p>` +
        `<p>This link expires ${escapeHtml(expiry)}. If you didn't expect this, you can safely ignore this ` +
        `email — no account will be created.</p><p>ReferralPlatform</p>`,
    });
  }

  async sendOtpEmail(input: SendOtpEmailInput): Promise<void> {
    const expiry = input.expiresAt.toLocaleTimeString('en-AU', { timeStyle: 'short' });
    await this.send({
      to: input.to,
      subject: `Your ReferralPlatform verification code is ${input.code}`,
      text:
        `Hi ${input.recipientFirstName},\n\n` +
        `Your ReferralPlatform verification code is: ${input.code}\n\n` +
        `This code expires at ${expiry} and can only be used once. Never share this code with anyone — ` +
        `ReferralPlatform staff will never ask you for it.\n\nReferralPlatform`,
      html:
        `<p>Hi ${escapeHtml(input.recipientFirstName)},</p>` +
        `<p>Your ReferralPlatform verification code is:</p>` +
        `<p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${escapeHtml(input.code)}</p>` +
        `<p>This code expires at ${escapeHtml(expiry)} and can only be used once. Never share this code with ` +
        `anyone — ReferralPlatform staff will never ask you for it.</p><p>ReferralPlatform</p>`,
    });
  }

  private async send(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.fromAddress, ...message });
    } catch (err) {
      this.logger.error(`Failed to send email to ${redactEmail(message.to)}: ${(err as Error).message}`);
      throw err;
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Never log a full email address in application logs. */
function redactEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}
