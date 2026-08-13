import { bookingStatusDisplay, concernStatusDisplay, gpLinkStatusDisplay, referralStatusDisplay } from './status';

describe('referralStatusDisplay', () => {
  it('labels a queued referral as attention-toned', () => {
    expect(referralStatusDisplay('queued').tone).toBe('attention');
  });

  it('labels a completed referral as success-toned', () => {
    expect(referralStatusDisplay('completed').tone).toBe('success');
  });

  it('falls back to the raw status for an unrecognised value', () => {
    expect(referralStatusDisplay('some_future_status' as never).label).toBe('some_future_status');
  });
});

describe('gpLinkStatusDisplay', () => {
  it('labels a pending link as attention-toned', () => {
    expect(gpLinkStatusDisplay('pending_patient_approval').tone).toBe('attention');
  });

  it('labels a revoked link as urgent-toned', () => {
    expect(gpLinkStatusDisplay('revoked').tone).toBe('urgent');
  });
});

describe('bookingStatusDisplay', () => {
  it('labels a confirmed booking as success-toned', () => {
    expect(bookingStatusDisplay('confirmed').tone).toBe('success');
  });
});

describe('concernStatusDisplay', () => {
  it('labels an OAIC-escalated concern as urgent-toned', () => {
    expect(concernStatusDisplay('escalated_to_oaic').tone).toBe('urgent');
  });
});
