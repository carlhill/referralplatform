# Will ReferralPlatform satisfy GDPR?

*Prepared 13 August 2026*

## Short answer

Almost certainly GDPR doesn't apply to ReferralPlatform today, and won't unless the platform starts actively serving people who are physically located in the EU. The design work done so far — built around the Australian Privacy Act and the Australian Privacy Principles (APPs) — is the right legal basis to be working from. That said, several things already designed (crypto-shredding, the signed audit log, FHIR-based interoperability) happen to line up closely with what GDPR would demand if it ever did apply, which is worth knowing, and there are a few genuine gaps worth naming now rather than later.

## When GDPR actually applies to an Australian entity

GDPR's territorial reach (Article 3) isn't about where a company is incorporated — it's about three specific triggers, and an Australian organisation with zero EU presence can still be caught by the second and third:

1. **EU establishment** — an office, subsidiary, or other real presence in the EU. Not applicable here.
2. **Offering goods or services to people located in the EU** — regardless of whether payment is involved. The test is about the individual's location when the service is offered, not their nationality or citizenship. An Australian citizen physically in Australia isn't "in the EU" for this purpose; an Australian expat living in Berlin who uses the platform to manage their Australian GP referrals arguably is.
3. **Monitoring the behaviour of people in the EU** — tracking/profiling activity, most commonly triggered by things like EU-targeted analytics or ad tracking, not by a health platform's core function.

None of these are triggered by a platform built for Australian patients, GPs, and specialists, operating on Australian rails (Medicare, IHI/HPI-O, NASH, My Health Record). ([OAIC — Australian entities and the EU GDPR](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/more-guidance/australian-entities-and-the-european-union-general-data-protection-regulation), [gdpr.eu — Does GDPR apply to companies outside Europe?](https://gdpr.eu/companies-outside-of-europe/))

The realistic edge case: a patient (or carer) who is an Australian resident/citizen but temporarily or permanently located in the EU continues to log into ReferralPlatform to manage their Australian healthcare — check a referral status, view a Follow-up Plan, update consent settings. That's "offering a service to a person in the EU" in GDPR's own terms, even though the healthcare itself is entirely Australian. It's a narrow, low-volume scenario at MVP, but not a theoretical zero, and it's worth having a documented view on rather than being surprised by it later.

## What GDPR would actually require, if it applied

For calibration — this is the bar GDPR sets for an organisation it does apply to, which is a genuinely higher bar than the Australian Privacy Act in several specific respects:

- **Explicit lawful basis per processing activity (Art 6)**, and for health data specifically — classified as "special category data" under **Article 9** — an explicit, opt-in consent or another narrow Art 9(2) basis (e.g. provision of health care). The Privacy Act's APPs don't require this same explicit per-activity legal-basis documentation.
- **A Data Protection Officer (Art 37)**, mandatory where core activities involve large-scale processing of special category data — which a national referral platform, if GDPR applied, would clearly meet. The Privacy Act has no DPO mandate; the OAIC recommends a Privacy Officer, which is a lighter obligation.
- **An EU representative (Art 27)**, required for a non-EU controller GDPR applies to, unless processing of EU data subjects is occasional and low-risk. Health data is specifically excluded from that occasional/low-risk carve-out, so if GDPR ever applied here even for a handful of EU-based patients, an EU representative would likely be required — not just a compliance policy.
- **72-hour breach notification to the regulator (Art 33/34)**. Australia's Notifiable Data Breaches scheme requires notification "as soon as practicable" — no hard deadline. GDPR's 72-hour clock is stricter.
- **Data Protection Impact Assessment / DPIA (Art 35)**, mandatory for high-risk processing, which large-scale health data processing clearly is. The Australian equivalent — a Privacy Impact Assessment (PIA) — is OAIC best-practice guidance for high-privacy-risk projects, not a strict legal mandate, but a project like this should be commissioning one anyway.
- **Right to erasure / "right to be forgotten" (Art 17)** and **data portability (Art 20)** — both are GDPR rights with no direct Privacy Act equivalent.
- **Restrictions on transferring data outside the EU (Chapter V)** — adequacy decisions or standard contractual clauses required for cross-border transfer.

([OAIC — Australian entities and the EU GDPR](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/more-guidance/australian-entities-and-the-european-union-general-data-protection-regulation), [gdpr.eu — Does GDPR apply to companies outside Europe?](https://gdpr.eu/companies-outside-of-europe/))

## Where the existing design already meets that bar (worth knowing, not required)

Three things already recommended in this project happen to satisfy GDPR-grade requirements, even though nothing here obligates it:

- **Crypto-shredding directly satisfies Article 17 (erasure).** This was designed to resolve the tension between the immutable audit log and a patient's right to correction/deletion under the Privacy Act — but it's the exact same mechanism GDPR's right-to-erasure requires for any system with an append-only audit trail. No extra work needed if GDPR ever became relevant.
- **The FHIR-based interoperability design substantially satisfies Article 20 (portability).** A referral record held in a standard structured clinical format, exportable to another system, is functionally what GDPR's portability right demands.
- **The NASH-signed, hash-chained audit log satisfies GDPR's accountability principle (Art 5(2)) better than most systems built for the Privacy Act alone need to.** Non-repudiation and demonstrable accountability are exactly what Art 5(2) asks for.

This isn't a coincidence worth over-reading — it reflects that "build it properly" tends to converge on similar controls regardless of which regulation is driving it. But it does mean that if the platform ever expanded toward the UK/EU systems studied earlier (NHS e-RS, Denmark's MedCom), or accepted an EU-based patient, the gap to close would be narrower than starting from scratch.

## The genuine gaps, if GDPR-grade compliance is ever wanted (now, voluntarily, or later, mandatorily)

- **No DPO or EU representative role has been designed into the platform's governance model.** Not needed today; worth a placeholder in the org design if international expansion is ever seriously considered.
- **No formal lawful-basis-per-processing-activity register exists yet**, distinct from the consent-capture UX already designed. The Privacy Act doesn't require this; a GDPR-grade design would.
- **Breach response is currently scoped to "as soon as practicable" (the Australian standard), not a hard 72-hour clock.** Worth adopting the 72-hour internal target regardless of legal requirement — it's the stricter global bar and costs little to build toward now versus retrofitting under pressure later.
- **No PIA (Privacy Impact Assessment) has been commissioned for the platform.** Not GDPR-specific, but exactly the artifact that would double as DPIA-readiness if GDPR-equivalent compliance is ever pursued, and it's already good Australian practice for a project handling this volume of health data — worth commissioning before real patients are onboarded, not after.
- **Data residency hasn't been explicitly locked to Australia in the architecture.** It almost certainly will be by default, given the NASH/IHI/My Health Record dependencies, but it's worth stating as an explicit architectural decision rather than an assumption — this is also what keeps the international-transfer question (GDPR Chapter V, or its Privacy Act equivalent, APP 8) simple.

## Bottom line

Don't spend engineering or legal effort chasing GDPR compliance now — it isn't triggered, and the platform's actual regulatory foundation is the Privacy Act/APPs, My Health Record's own governance rules, and the state-based schemes already researched for Phase 2. Treat GDPR as a distinct, separately-scoped project for if/when the platform genuinely serves EU-based individuals or pursues international partnerships (the UK/Denmark/Canada systems already studied) — at which point the EU-representative and DPO requirements become real, not optional. In the meantime, the PIA and the 72-hour breach-response target are worth doing anyway on their own merits, and both happen to shorten that future path if it's ever needed.

Not legal advice — GDPR applicability determinations, especially around the "offering services to people in the EU" trigger, should be confirmed with a privacy lawyer before being relied on, particularly once real EU-located users (even a handful) are a live possibility rather than a hypothetical.
