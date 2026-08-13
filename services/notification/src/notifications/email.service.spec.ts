import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

jest.mock('nodemailer');

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    SMTP_HOST: 'mailhog',
    SMTP_PORT: 1025,
    EMAIL_FROM: 'no-reply@referralplatform.example.au',
    ...overrides,
  };
  return {
    get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback),
  } as unknown as ConfigService;
}

describe('EmailService', () => {
  let sendMail: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail = jest.fn().mockResolvedValue({ messageId: 'msg-1@mailhog' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  it('creates a transporter pointed at SMTP_HOST/SMTP_PORT (Mailhog by default) with no auth', () => {
    new EmailService(makeConfig());
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'mailhog', port: 1025, secure: false }),
    );
    const call = (nodemailer.createTransport as jest.Mock).mock.calls[0][0];
    expect(call.auth).toBeUndefined();
  });

  it('adds SMTP auth when SMTP_USER is configured', () => {
    new EmailService(makeConfig({ SMTP_USER: 'apikey', SMTP_PASSWORD: 'secret' }));
    const call = (nodemailer.createTransport as jest.Mock).mock.calls[0][0];
    expect(call.auth).toEqual({ user: 'apikey', pass: 'secret' });
  });

  it('send() actually calls transporter.sendMail with the from address and returns the provider message id', async () => {
    const service = new EmailService(makeConfig());
    const result = await service.send({ to: 'patient@example.com', subject: 'Hi', text: 'Body text' });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'no-reply@referralplatform.example.au',
        to: 'patient@example.com',
        subject: 'Hi',
        text: 'Body text',
      }),
    );
    expect(result.providerMessageId).toBe('msg-1@mailhog');
  });

  it('sendOtpEmail() sends the code in both text and html bodies', async () => {
    const service = new EmailService(makeConfig());
    await service.sendOtpEmail({
      to: 'patient@example.com',
      recipientFirstName: 'Alex',
      code: '4821',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const call = sendMail.mock.calls[0][0];
    expect(call.subject).toContain('4821');
    expect(call.text).toContain('4821');
    expect(call.html).toContain('4821');
  });

  it('sendActivationLinkEmail() includes the activation URL', async () => {
    const service = new EmailService(makeConfig());
    await service.sendActivationLinkEmail({
      to: 'patient@example.com',
      patientFirstName: 'Alex',
      activationUrl: 'https://app.referralplatform.example.au/activate/abc123',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    const call = sendMail.mock.calls[0][0];
    expect(call.html).toContain('https://app.referralplatform.example.au/activate/abc123');
  });

  it('propagates and logs a transporter failure rather than swallowing it', async () => {
    sendMail.mockRejectedValueOnce(new Error('connection refused'));
    const service = new EmailService(makeConfig());
    await expect(service.send({ to: 'patient@example.com', subject: 'Hi', text: 'Body' })).rejects.toThrow(
      'connection refused',
    );
  });
});
