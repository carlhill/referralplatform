import { isValidTransition, allowedNextStages } from './pipeline-stage';

describe('pipeline-stage', () => {
  it('allows the forward happy-path transitions', () => {
    expect(isValidTransition('lead', 'contacted')).toBe(true);
    expect(isValidTransition('contacted', 'registered')).toBe(true);
    expect(isValidTransition('registered', 'hpio_verification_pending')).toBe(true);
    expect(isValidTransition('hpio_verification_pending', 'hpio_verified')).toBe(true);
    expect(isValidTransition('hpio_verified', 'compliance_checklist_pending')).toBe(true);
    expect(isValidTransition('compliance_checklist_pending', 'compliance_checklist_acknowledged')).toBe(true);
    expect(isValidTransition('compliance_checklist_acknowledged', 'live')).toBe(true);
  });

  it('allows the hpio verification failure/retry branch', () => {
    expect(isValidTransition('hpio_verification_pending', 'hpio_verification_failed')).toBe(true);
    expect(isValidTransition('hpio_verification_failed', 'hpio_verification_pending')).toBe(true);
  });

  it('rejects skipping stages', () => {
    expect(isValidTransition('lead', 'live')).toBe(false);
    expect(isValidTransition('lead', 'hpio_verified')).toBe(false);
  });

  it('rejects any transition out of the terminal live stage', () => {
    expect(allowedNextStages('live')).toEqual([]);
    expect(isValidTransition('live', 'stalled')).toBe(false);
  });

  it('allows stalling from any non-terminal stage and resuming from stalled', () => {
    expect(isValidTransition('hpio_verification_pending', 'stalled')).toBe(true);
    expect(isValidTransition('stalled', 'contacted')).toBe(true);
  });
});
