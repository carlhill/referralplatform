import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';
import { assertStepUp } from './step-up';

function principalWith(raw: Record<string, unknown>): AuthenticatedPrincipal {
  return { sub: 'user-1', principalType: 'patient', roles: [], raw: raw as any };
}

describe('assertStepUp', () => {
  it('passes when the acr claim matches the required value', () => {
    expect(() => assertStepUp(principalWith({ acr: 'passkey' }), 'passkey')).not.toThrow();
  });

  it('passes when amr includes a phishing-resistant credential', () => {
    expect(() => assertStepUp(principalWith({ amr: ['webauthn'] }), 'passkey')).not.toThrow();
    expect(() => assertStepUp(principalWith({ amr: ['hwk'] }), 'passkey')).not.toThrow();
  });

  it('rejects when neither acr nor amr indicate step-up', () => {
    expect(() => assertStepUp(principalWith({ acr: 'password' }), 'passkey')).toThrow(ForbiddenException);
    expect(() => assertStepUp(principalWith({}), 'passkey')).toThrow(ForbiddenException);
  });
});
