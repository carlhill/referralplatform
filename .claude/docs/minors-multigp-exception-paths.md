# Minors, exception/error paths, and multi-GP/interstate patients

*Prepared 13 August 2026*

## 1. Minors as primary patients — can we check a Working with Children Check on a government register?

Researched this directly, and the honest answer changes the question a little: **for the treating GP or specialist themselves, a Working with Children Check (WWCC) usually isn't the applicable control at all** — but it's still real, and still worth building a lookup for, because it applies to a different group of people the platform will eventually onboard.

**Registered health practitioners (AHPRA-registered GPs/specialists) are exempt from WWCC requirements in most states when acting within their registered profession.** Queensland's legislation is explicit: "a health practitioner registered with Ahpra is exempt from obtaining one when employed or carrying on a business as part of their functions as a registered health practitioner." The reasoning is that AHPRA registration plus the mandatory-notification obligations built into the National Law already provide an equivalent screening/accountability layer. ([MDA National — Do GPs need a Working with Children Check](https://www.mdanational.com.au/advice-and-support/library/articles-and-case-studies/2023/11/do-gps-need-a-working-with-children-check))

But this exemption is **not uniform** — it's genuinely state-by-state, which matters a lot for a national platform:

- **NSW, Northern Territory, South Australia, and Tasmania** still require GPs to hold a WWCC (NSW's own guidance goes as far as recommending a staff chaperone sit in on adolescent consultations if the GP lacks clearance).
- **Queensland, Victoria, Western Australia, and the ACT** do not require it for GPs in private practice.

So this becomes another entry in the jurisdiction-specific policy layer already being built for the compliance-checklist feature — not a single yes/no gate, but a state-keyed rule (keyed to the practising GP's state, the same way the compliance-checklist content already is).

**Where a WWCC check genuinely matters more is Phase 2 — Justice Department and social-services organisation onboarding.** Caseworkers, support workers, and non-clinical staff in those organisations are not AHPRA-registered and don't get the health-practitioner exemption; a WWCC (or the jurisdiction's equivalent, e.g. a "working with vulnerable people" check in the ACT) is a real, applicable requirement for that onboarding flow.

**Can this be looked up on a government register today?** Partially, and it's currently the weakest link in the design for exactly the reason already flagged for AHPRA/NHSD: **there is no single national WWCC database yet.** Each state runs its own register, and verification today generally means checking the specific issuing state's own online portal (where one exists) or relying on the "sighting duty" — the legal responsibility to view and record the check number stays with the organisation doing the onboarding, not with an automated system. National reform is underway: jurisdictions have endorsed **mutual recognition of negative notices** ("banned in one, banned in all") and a **National Continuous Checking Capability**, run through the Australian Criminal Intelligence Commission, with rollout beginning — but this is a live, moving reform, not a finished system to integrate against yet. ([Koora — WWCC by state](https://koora.care/resources/working-with-children-check-by-state))

**Recommendation:** build the WWCC field into the Justice Dept/social-services organisational onboarding flow now (capture the check number and issuing state, with a manual verification step against that state's own portal where one exists), and explicitly track the National Continuous Checking Capability rollout as something to plug into once it's live — that's a much better long-term integration target than trying to build against eight separate state portals today. This has been added to the regulator/partner questions list.

## 2. Exception and error paths — both parties notified, web + mobile, and how GP/patient resolve things

Agreed on both counts — this needs to reach both parties, and a native mobile app (not just web) is the right call, for a specific reason: several of the exception events (a declined referral, an expiring approval, an unmatched booking) are time-sensitive, and push notifications are the only channel here with a real chance of being seen promptly. Email gets missed; SMS can't carry clinical detail safely.

**Platform shape:** two apps, not four —

- **Patient/carer: native mobile app (iOS/Android) as the primary surface, with a companion web app for anything easier to do on a bigger screen** (reviewing longer document history, managing linked GPs, downloading letters). Mobile is primary because push notifications, biometric/passkey login, camera capture for the document vault, and the OTP flow all belong on a phone by nature.
- **GP/specialist: web app first, likely no separate native app.** GPs and specialists already live inside their practice software all day; a second app to check is friction, not a feature. The right answer here is a responsive web portal, reachable either directly or embedded/deep-linked from inside the practice software once Tier C integration exists (the "native send-to-platform button" already scoped in the onboarding doc). A native GP/specialist mobile app can be a later addition for on-the-go booking/roster management, not an MVP requirement.

**How GP and patient actually resolve an exception:** the cleanest design is a **referral-scoped message thread** — every referral gets its own secure, in-app conversation between the GP and patient (and specialist, once involved), rather than exceptions being handled over ad hoc phone calls or unaudited SMS. This does three things at once: it gives both parties an obvious place to go when a notification says "action needed," it keeps a complete record of how an exception was resolved (feeding straight into the same signed audit log everything else does), and it avoids clinical detail ever needing to travel over SMS.

The notification pattern for every exception type is the same: **both parties get an in-app + push notification at the moment it happens, each with a clear next action, deep-linking straight into that referral's message thread.** Concretely:

- **Specialist declines a referral as inappropriate** → patient and GP both notified; GP's notification includes a "choose alternative pathway" action (which can re-open the HealthPathways-suggested specialist type from the referral-creation step).
- **2-day activation queue expires with no patient response** → GP notified the referral lapsed and needs re-triggering; patient (if they show up late) sees a clear "this referral needs your GP to resend it" state rather than a silent dead end.
- **No matching booking slot found** → patient already goes to the waitlist (existing design); add an explicit patient-facing option to message the GP directly from that screen if they want to escalate rather than wait.
- **Patient wants to cancel a booking or referral** → both notified, slot released back to the specialist's calendar, and the referral's status (and reason, if given) is visible to the GP rather than just disappearing.

I've added this — the mobile-app requirement, the referral-scoped message thread, and the dual-notification pattern — to the business process flow below.

## 3. Interstate patient movement and patients with multiple GPs

This is the same problem as the fraud-prevention/EMPI work already done, viewed from the opposite direction: instead of "how do we stop a fraudulent account being created," it's "how do we let a patient legitimately have more than one linked GP, or move between them, without weakening the account's security."

**Recommended design — GPs are "linked" to a patient account, not owners of it, and every new link needs the patient's own approval:**

- A ReferralPlatform account belongs to the patient (or their carer/delegate), identified by IHI as already established — not to any single GP or practice. Multiple GPs (a regular GP, a second practice, a locum, an interstate GP seen while travelling) can all be linked to the same account simultaneously.
- **When a GP who isn't yet linked to a patient's existing account tries to create a referral for them, the patient gets a push approval request on the mobile app** — "Dr [name] at [practice] wants to connect to your ReferralPlatform account and send you a referral. Approve / Decline" — before anything proceeds. This is the same pattern already designed for new-account creation, just applied to an existing account instead.
- If there's no response within a set window (recommend reusing the existing 2-day queue timing for consistency), the GP is told the referral is pending patient approval, with an urgent-case escalation option (contact the patient directly, or use the urgent-bypass path) rather than being left with no signal at all.
- **The existing consent/security page (module 7) becomes the natural home for managing this** — a live "Linked GPs and practices" list, with the ability to revoke a GP's link (e.g. after moving house or changing practices), sitting right next to the referral-visibility consent controls already designed there.

**On interstate movement specifically:** because this is a single national platform rather than a state-siloed one, the patient's account and data don't need to "move" anywhere when they relocate — the account is already reachable nationally. What does need to key off location is the *content* served to whichever GP is currently treating them: the compliance-checklist rules, the WWCC requirement from Section 1, and the HealthPathways region should all be keyed to **the treating GP's state**, not the patient's original state or home address. That's a reasonable default, but it should be confirmed rather than assumed — it's the same category of open legal question already flagged for the state-by-state information-sharing schemes, so it's been added there rather than treated as settled.

## Updated flow

The business process flow diagram has been updated to reflect all three of these — a new-GP-authorisation gate at the top of the flow, an urgent-bypass path through booking, and dual patient+GP notification on every exception branch. See the refreshed `business-process-flow.md` and its HTML/artifact version.
