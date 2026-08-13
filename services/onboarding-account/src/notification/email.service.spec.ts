import { ConfigService } from '@nestjs/config';

const sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
const createTransport = jest.fn().mockReturnValue({ sendMail });

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => createTransport(...args),
}));

// Imported after the mock so EmailService picks up the mocked module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EmailService } = require('./email.service');

function makeConfig(): ConfigService {
  const values: Record<string, unknown> = {
    SMTP_HOST: 'mailhog',
    SMTP_PORT: 1025,
    EMAIL_FROM: 'no-reply@referralplatform.example.au',
  };
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('EmailService', () => {
  beforeEach(() => {
    sendMail.mockClear();
    createTransport.mockClear();
  });

  it('configures a transport against the configured SMTP host/port (Mailhog in local/dev/CI)', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const service = new EmailService(makeConfig());
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'mailhog', port: 1025 }));
  });

  it('sends the activation link email with the link and expiry embedded', async () => {
    const service = new EmailService(makeConfig());
    const expiresAt = new Date('2026-08-15T10:00:00Z');
    await service.sendActivationLinkEmail({
      to: 'patient@example.com',
      patientFirstName: 'Jane',
      activationUrl: 'https://patient.example/activate?token=xyz',
      expiresAt,
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe('patient@example.com');
    expect(call.text).toContain('https://patient.example/activate?token=xyz');
    expect(call.html).toContain('https://patient.example/activate?token=xyz');
  });

  it('sends the OTP email with the 6-digit code embedded', async () => {
    const service = new EmailService(makeConfig());
    await service.sendOtpEmail({
      to: 'carer@example.com',
      recipientFirstName: 'Sam',
      code: '482913',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const call = sendMail.mock.calls[0][0];
    expect(call.subject).toContain('482913');
    expect(call.text).toContain('482913');
    expect(call.html).toContain('482913');
  });

  it('propagates a send failure rather than silently swallowing it', async () => {
    sendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));
    const service = new EmailService(makeConfig());
    await expect(
      service.sendOtpEmail({
        to: 'carer@example.com',
        recipientFirstName: 'Sam',
        code: '482913',
        expiresAt: new Date(),
      }),
    ).rejects.toThrow('SMTP connection refused');
  });
});
