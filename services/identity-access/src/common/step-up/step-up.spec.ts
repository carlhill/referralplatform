import type { AuthenticatedPrincipal } from '@referralplatform/auth-client';
import { assertStepUp } from './step-up';

function principalWithRaw(raw: Record<string, unknown>): AuthenticatedPrincipal {
  return {
    sub: 'user-1',
    principalType: 'gp',
    roles: [],
    raw,
  } as unknown as AuthenticatedPrincipal;
}

describe('assertStepUp', () => {
  it('passes when the acr claim matches the required step-up value', () => {
    expect(() => assertStepUp(principalWithRaw({ acr: 'passkey' }), 'passkey')).not.toThrow();
  });

  it('passes when amr indicates a webauthn/hardware-key re-auth', () => {
    expect(() => assertStepUp(principalWithRaw({ amr: ['pwd', 'webauthn'] }), 'passkey')).not.toThrow();
    expect(() => assertStepUp(principalWithRaw({ amr: ['hwk'] }), 'passkey')).not.toThrow();
  });

  it('rejects a token with neither an elevated acr nor a webauthn/hwk amr entry', () => {
    expect(() => assertStepUp(principalWithRaw({ acr: '0', amr: ['pwd'] }), 'passkey')).toThrow(/step-up/i);
  });

  it('rejects a token with no acr/amr claims at all', () => {
    expect(() => assertStepUp(principalWithRaw({}), 'passkey')).toThrow(/step-up/i);
  });
});
