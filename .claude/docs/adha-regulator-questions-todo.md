# Questions and action items for the ADHA / Services Australia conversation

*Running list — add to this as new open questions surface. Update status as items get answered.*

## To ask

- [ ] **MyMedicare enrolment status check.** Is there an accredited-software-vendor pathway to check a patient's MyMedicare enrolment status programmatically (API), rather than the manual PRODA-gated HPOS web portal? Practice software vendors (MedicalDirector, Best Practice) already have MyMedicare administration built in, so some machine-readable registration mechanism must exist on their side even if it isn't publicly documented — worth asking directly rather than assuming it doesn't exist. *(Until answered: v1 is asking the patient directly and reconfirming periodically.)*
- [ ] **My Health Record conformance pathway.** What's the testing/conformance process for a new clinical software product that needs to write referral documents to My Health Record? Confirm current requirements against the published Vendor Declaration Form and Testing and Conformance resources.
- [ ] **Sandbox/pilot access.** Does ADHA have an existing pilot, sandbox, or working group for patient-consent-linked referral traceability that a new entrant could plug into, short of a full production myGov-level connection?
- [ ] **Secure messaging interoperability initiative.** ADHA has run its own program to get HealthLink/Medical-Objects/ReferralNet/Argus interoperable with each other. Is there an onboarding path to plug into that initiative directly, rather than negotiating bilateral integrations with each vendor separately?
- [ ] **Digital ID / myID relying-party integration.** Confirm the practical steps and any requirements to accept myID (or another TDIF-accredited provider) logins as a relying party — this should be the lightweight path (versus seeking TDIF accreditation ourselves, which is a heavier, later-stage option not needed at MVP).
- [ ] **Current grant rounds.** Check live status of MRFF (Medical Research Future Fund) digital health trial funding and any current PHN regional innovation/digital-uplift grant rounds — these open and close on their own schedule, so this needs a live check rather than relying on past research.

## Practical first move

ADHA runs an active industry/vendor engagement channel via its "Partnership Pulse" newsletter and Digital Health Developer Portal — that's the door to knock on for an introductory conversation, not a general contact form. Lead with the sandbox/pilot question and the MyMedicare question, since those are the two most likely to actually change near-term product decisions.

## To ask / do — Healthcare Identifiers Service and NASH

- [ ] **Register the platform for its own HPI-O.** To become a legitimate, addressable participant in secure messaging, My Health Record, and NASH-backed signing (not just a website consuming public APIs), the platform needs its own Healthcare Provider Identifier for Organisations through the Healthcare Identifiers Service. This is a foundational prerequisite for several other items on this list, not a one-off task — worth sequencing early.
- [ ] **Confirm the NASH pathway for platform-issued or specialist-linked digital signatures.** Ask whether the platform can build its audit-log signing on specialists' existing NASH-issued credentials, or needs its own NASH organisation certificate issued against the HPI-O above.

## To ask — Healthdirect Australia (NHSD), separate body from ADHA

- [ ] **NHSD caching/refresh terms.** Confirm the actual terms of use for the NHSD Consumer API — is local caching of directory data explicitly permitted, is there a required or recommended refresh interval, are there rate limits that would constrain a daily full-sync architecture, and what attribution is required? Couldn't confirm these specifics from public documentation (the published developer guide PDF link is dead) — needs a direct question through their developer portal.

## To ask / do — HealthPathways Community (Streamliners), separate body from ADHA and PHNs

- [ ] **Apply for Pathway Link API access and documentation.** HealthPathways publishes a free vendor integration API ("Pathway Link API"). Application/contact is via help@healthpathwayscommunity.org or the HealthPathways Platform Integrations page. Get the actual API docs to confirm what a pathway lookup returns (a URL only, vs structured "where to refer" content) and what's needed to call it (auth, region/PHN selection mechanism).
- [ ] **Confirm regional content-licensing terms with the pilot PHN.** The API is centrally available, but pathway content itself is licensed and edited per PHN region — confirm with the specific PHN chosen as regional pilot partner whether they'll support/endorse the integration (not just tolerate it), since that changes it from a technical connection into an actual GP-facing feature.

## To ask / do — child safety, TGA, and insurance/indemnity

- [ ] **Track the National Continuous Checking Capability rollout (ACIC).** No single national WWCC database exists yet; jurisdictions have endorsed mutual recognition of negative notices and a national continuous-checking capability via the Australian Criminal Intelligence Commission. Worth checking rollout status directly with ACIC/National Office for Child Safety before building the Justice Dept/social-services WWCC capture step, so it's built against the eventual real integration rather than eight separate state portals.
- [ ] **TGA Software as a Medical Device (SaMD) classification check.** ReferralPlatform likely sits outside TGA's SaMD definition since it doesn't itself provide diagnosis/treatment recommendations — but the AI-assisted structured extraction and any future AI triage features sit close enough to the line to need an explicit classification check with the TGA rather than an assumption.
- [ ] **Contact Avant, MDA National, and MIGA (the major AU medical defence organisations) before launch.** Ask explicitly whether a member's existing professional indemnity cover extends to referrals/communications made through a third-party platform like this, and whether they'd want anything specific in ReferralPlatform's Terms of Service to remove ambiguity about where clinical responsibility sits versus platform/technical responsibility.

## Answered

*(move items here once resolved, with the answer and date)*

## Source context

Compiled from the business case and patient-centred design research already in this project — see `business-case-competition.md` (sections 7–10) and `patient-centered-recall-ai-intake.md` for the full reasoning behind each item.
