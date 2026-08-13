import { canonicalJson } from './canonical-json';

describe('canonicalJson', () => {
  it('produces the same string regardless of key insertion order', () => {
    const a = { type: 'referral.created', actor: { id: 'gp_1', principalType: 'gp' } };
    const b = { actor: { principalType: 'gp', id: 'gp_1' }, type: 'referral.created' };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('sorts keys inside arrays of objects too', () => {
    const a = { list: [{ b: 1, a: 2 }] };
    const b = { list: [{ a: 2, b: 1 }] };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('is sensitive to actual value differences', () => {
    const a = { x: 1 };
    const b = { x: 2 };
    expect(canonicalJson(a)).not.toBe(canonicalJson(b));
  });
});
