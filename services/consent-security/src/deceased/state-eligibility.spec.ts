import { isEligibleByDefaultStateRule } from './state-eligibility';

describe('isEligibleByDefaultStateRule', () => {
  it('always allows a coroner, in every state', () => {
    expect(isEligibleByDefaultStateRule('VIC', 'coroner')).toBe(true);
    expect(isEligibleByDefaultStateRule('NSW', 'coroner')).toBe(true);
  });

  it('always allows an executor or administrator', () => {
    expect(isEligibleByDefaultStateRule('VIC', 'executor')).toBe(true);
    expect(isEligibleByDefaultStateRule('ACT', 'administrator')).toBe(true);
    expect(isEligibleByDefaultStateRule('NSW', 'executor')).toBe(true);
  });

  it('allows immediate family everywhere except VIC and ACT', () => {
    expect(isEligibleByDefaultStateRule('NSW', 'immediate_family')).toBe(true);
    expect(isEligibleByDefaultStateRule('QLD', 'immediate_family')).toBe(true);
    expect(isEligibleByDefaultStateRule('VIC', 'immediate_family')).toBe(false);
    expect(isEligibleByDefaultStateRule('ACT', 'immediate_family')).toBe(false);
  });

  it('never defaults "other" to eligible', () => {
    expect(isEligibleByDefaultStateRule('NSW', 'other')).toBe(false);
    expect(isEligibleByDefaultStateRule('VIC', 'other')).toBe(false);
  });
});
