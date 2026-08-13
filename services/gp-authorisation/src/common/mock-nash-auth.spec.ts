import { isValidHpioFormat, mockVerifyPracticeSystemAuthorised } from './mock-nash-auth';

describe('mock-nash-auth (MOCK — replace with real integration)', () => {
  it('accepts a 16-digit numeric HPI-O', () => {
    expect(isValidHpioFormat('8003624900001234')).toBe(true);
    expect(mockVerifyPracticeSystemAuthorised('8003624900001234')).toBe(true);
  });

  it.each(['', 'abc', '123', '80036249000012345', '800362490000123a'])('rejects malformed HPI-O %p', (value) => {
    expect(isValidHpioFormat(value)).toBe(false);
    expect(mockVerifyPracticeSystemAuthorised(value)).toBe(false);
  });
});
