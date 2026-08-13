import { generateOtpCode, hashOtpCode, verifyOtpCode } from './otp.util';

describe('otp.util', () => {
  it('generates a 6-digit zero-padded code', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('hashes deterministically for the same code and secret', () => {
    expect(hashOtpCode('123456', 'secret')).toBe(hashOtpCode('123456', 'secret'));
  });

  it('hashes differently for a different secret', () => {
    expect(hashOtpCode('123456', 'secret-a')).not.toBe(hashOtpCode('123456', 'secret-b'));
  });

  it('verifies a correct code against its hash', () => {
    const hash = hashOtpCode('654321', 'secret');
    expect(verifyOtpCode('654321', hash, 'secret')).toBe(true);
  });

  it('rejects an incorrect code', () => {
    const hash = hashOtpCode('654321', 'secret');
    expect(verifyOtpCode('000000', hash, 'secret')).toBe(false);
  });

  it('rejects a code verified against the wrong secret', () => {
    const hash = hashOtpCode('654321', 'secret-a');
    expect(verifyOtpCode('654321', hash, 'secret-b')).toBe(false);
  });
});
