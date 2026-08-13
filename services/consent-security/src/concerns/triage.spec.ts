import { BadRequestException } from '@nestjs/common';
import { triageConcern } from './triage';

describe('triageConcern', () => {
  it('routes a privacy/consent breach to the Privacy Officer', () => {
    expect(
      triageConcern({
        isAboutHowCareWasHandled: false,
        isAboutSomethingNotWorkingOnThePlatform: false,
        isAboutSomeoneSeeingSomethingTheyShouldnt: true,
      }),
    ).toEqual({ category: 'privacy_or_consent_breach', routedTo: 'privacy_officer' });
  });

  it('routes clinical care/conduct to AHPRA/state complaints commissioner', () => {
    expect(
      triageConcern({
        isAboutHowCareWasHandled: true,
        isAboutSomethingNotWorkingOnThePlatform: false,
        isAboutSomeoneSeeingSomethingTheyShouldnt: false,
      }),
    ).toEqual({ category: 'clinical_care_or_conduct', routedTo: 'ahpra_or_state_health_complaints_commissioner' });
  });

  it('routes a platform/technical issue to internal platform support', () => {
    expect(
      triageConcern({
        isAboutHowCareWasHandled: false,
        isAboutSomethingNotWorkingOnThePlatform: true,
        isAboutSomeoneSeeingSomethingTheyShouldnt: false,
      }),
    ).toEqual({ category: 'platform_technical', routedTo: 'internal_platform_support' });
  });

  it('prioritises privacy over clinical and platform when multiple are flagged', () => {
    expect(
      triageConcern({
        isAboutHowCareWasHandled: true,
        isAboutSomethingNotWorkingOnThePlatform: true,
        isAboutSomeoneSeeingSomethingTheyShouldnt: true,
      }),
    ).toEqual({ category: 'privacy_or_consent_breach', routedTo: 'privacy_officer' });
  });

  it('throws if nothing was answered yes', () => {
    expect(() =>
      triageConcern({
        isAboutHowCareWasHandled: false,
        isAboutSomethingNotWorkingOnThePlatform: false,
        isAboutSomeoneSeeingSomethingTheyShouldnt: false,
      }),
    ).toThrow(BadRequestException);
  });
});
