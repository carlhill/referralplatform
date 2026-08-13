import { followUpStatusDisplay, followUpUrgency, gpLinkStatusDisplay, referralStatusDisplay } from './referralStatus';
import type { ReferralStatus, GpLinkStatus, FollowUpPlanStatus } from '../api/types';

const REFERRAL_STATUSES: ReferralStatus[] = [
  'queued',
  'lapsed',
  'routed',
  'declined',
  'booked',
  'in_review',
  'resolved_econsult',
  'completed',
  'cancelled',
];

const GP_LINK_STATUSES: GpLinkStatus[] = ['pending_patient_approval', 'approved', 'declined', 'revoked', 'expired'];

const FOLLOW_UP_STATUSES: FollowUpPlanStatus[] = ['active', 'completed', 'suppressed_deceased', 'superseded_by_new_referral'];

describe('referralStatusDisplay', () => {
  it('has a label and tone for every referral status', () => {
    for (const status of REFERRAL_STATUSES) {
      const { label, tone } = referralStatusDisplay(status);
      expect(label).toBeTruthy();
      expect(['neutral', 'success', 'attention', 'urgent']).toContain(tone);
    }
  });

  it('marks a lapsed/declined referral urgent, and a booked/completed referral success', () => {
    expect(referralStatusDisplay('lapsed').tone).toBe('urgent');
    expect(referralStatusDisplay('declined').tone).toBe('urgent');
    expect(referralStatusDisplay('booked').tone).toBe('success');
    expect(referralStatusDisplay('completed').tone).toBe('success');
  });
});

describe('gpLinkStatusDisplay', () => {
  it('has a label and tone for every GP-link status', () => {
    for (const status of GP_LINK_STATUSES) {
      const { label, tone } = gpLinkStatusDisplay(status);
      expect(label).toBeTruthy();
      expect(['neutral', 'success', 'attention', 'urgent']).toContain(tone);
    }
  });
});

describe('followUpStatusDisplay', () => {
  it('has a label and tone for every Follow-up Plan status', () => {
    for (const status of FOLLOW_UP_STATUSES) {
      const { label, tone } = followUpStatusDisplay(status);
      expect(label).toBeTruthy();
      expect(['neutral', 'success', 'attention', 'urgent']).toContain(tone);
    }
  });
});

describe('followUpUrgency', () => {
  it('flags an overdue review date as urgent', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(followUpUrgency(yesterday, null)).toBe('urgent');
  });

  it('flags a due courtesy call (but future review date) as attention', () => {
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(followUpUrgency(nextMonth, yesterday)).toBe('attention');
  });

  it('is neutral when nothing is due yet', () => {
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(followUpUrgency(nextMonth, nextWeek)).toBe('neutral');
  });
});
