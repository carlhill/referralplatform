# Referral Platform — Identity, Carer/Patient Disambiguation, and Security Recommendations

*Prepared 13 August 2026*

## 1. The core problem

The platform's only anchor for a new patient's identity is possession of a mobile number. A 4-digit SMS OTP proves someone has that phone in hand — it proves nothing about *who* that person is. Where a carer legitimately holds the patient's phone (or the only phone on file is the carer's own), the platform has no way to tell "patient operating their own account" from "carer operating on the patient's behalf" apart from asking, and a self-report can be wrong either through confusion or bad faith.

This is not a novel problem — it's the same one My Health Record solved with its **nominated representative / authorised representative** split, and it's worth borrowing that model rather than inventing one from scratch.

Sources: [Nominated representatives – Australian Digital Health Agency](https://www.digitalhealth.gov.au/initiatives-and-programs/my-health-record/manage-your-record/privacy-and-access/nominated-representatives), [Authorised representatives – Australian Digital Health Agency](https://www.digitalhealth.gov.au/initiatives-and-programs/my-health-record/getting-started/authorised-representatives), [My Health Record for carers](https://www.myhealthrecord.gov.au/for-carers)

## 2. Borrow the two-tier representative model

My Health Record separates access into two tiers with very different evidentiary bars, and the referral platform should do the same:

**Nominated representative / delegate (low friction, self-declared)** — can view referral status, help complete forms, receive notifications. Cannot change consent/sharing settings, cannot add or remove other delegates, cannot see referral categories the patient has marked sensitive. Granted on self-declaration plus a lightweight confirmation loop. Revocable by the patient (or by platform support) at any time with no justification required.

**Authorised representative (high friction, evidence-based)** — full control of the account, equivalent to being the patient for platform purposes: can manage the consent page, add/remove delegates, see everything. Requires documentary evidence (power of attorney, guardianship order, parental authority for a minor) and, ideally, a stronger identity check on the carer themselves before elevation. This tier matches situations where the patient genuinely cannot manage their own account — cognitive impairment, minors, unconscious/incapacitated patients.

Almost everyone in the "carer holds the phone" scenario described only needs the first tier. Reserve the second tier — and its extra friction — for cases that actually require it.

## 3. Redesigned onboarding flow

1. **GP intake captures more than a mobile number.** At referral time, the GP's system should also record the patient's date of birth and (ideally) Medicare number or Individual Healthcare Identifier (IHI). This becomes a shared secret used later to bind the person clicking the link to the actual patient record, not just to whoever's holding the phone.

2. **SMS link, not OTP, goes out first.** A short-lived, single-use, clearly-branded link (not a generic shortlink — those read as scams and get ignored, especially by older patients). No OTP yet.

3. **On landing, verify before asking who's who.** Prompt for the DOB (and Medicare/IHI number if captured) the GP already has on file. This filters out wrong numbers and casual snooping before any identity branching happens.

4. **Ask the carer/patient question neutrally, after verification, not as an accusation.** Something like: *"Is this account for you, or are you helping [Patient First Name] set it up?"* Framing it as normal and expected (rather than as a compliance gate) reduces the incentive for a well-meaning carer to just click "it's me" to avoid extra steps.

5. **Branch A — "It's me":** proceed straight to OTP on the same number, activate as the patient/owner.

6. **Branch B — "I'm helping someone else":**
   - Collect the carer's own name, email, and relationship to the patient (parent/guardian, adult child, spouse/partner, professional support worker, other) — the relationship field feeds later risk scoring and audit, it doesn't need to be verified up front.
   - Ask whether the carer has their own mobile number, and whether it's the one already on file or a different one. If different, send the carer's own OTP to *that* number — this is the single highest-value change, because it means going forward the carer authenticates as themselves, not as the patient, and a SIM swap or lost phone on either side doesn't compromise the other person's access.
   - If there genuinely is only one shared number, activate the account but flag it internally as elevated risk (shared-channel household) and default to the lightweight delegate tier only.
   - Verify the carer's email via a separate link — a second, independent channel strengthens the audit trail and gives you a way to reach the carer if the phone number later changes hands again.
   - Grant delegate-tier access by default. Elevation to authorised representative requires the document-upload + review path from section 2.
   - If the GP practice holds any other contact channel for the patient (an email address, a next-of-kin contact), notify it that a carer/delegate has been set up. This gives the real patient a chance to flag unauthorized access even if they never touch the platform themselves.
   - Re-attest periodically (e.g., annually, or whenever a referral in a sensitive category is created) — ask "is [carer] still assisting you?" This satisfies the ongoing-consent expectation under the Australian Privacy Principles rather than treating consent as a one-time checkbox.

7. **Log every step of this immutably.** This directly serves the platform's MyGov traceability goal and gives you a defensible record if a carer/patient dispute ever arises.

## 4. Sensitive-category gating

Even a legitimate, well-meaning carer shouldn't automatically see everything. Let the patient (or the platform, by default, before the patient has had a chance to configure it) mark certain specialties as hidden from delegates by default — sexual health, mental health, reproductive health, drug and alcohol services are the standard list in Australian health privacy practice. Require a separate, explicit consent step before a delegate can see referrals in these categories, and require it again if the delegate is later elevated to authorised representative.

## 5. Aged-care / bulk-carer abuse pattern

A single carer or facility staff member legitimately assisting many patients is a known risk pattern (e.g., aged care staff impersonating multiple residents). Two implications:

- If the same mobile number or email repeatedly appears as "carer" across many otherwise-unrelated patient accounts, route that through a distinct **organisational carer** flow — verify the care organisation itself (ABN, registration), rather than treating each instance as an independent personal relationship.
- Rate-limit and monitor account-creation requests per GP, per mobile number, and per carer identity to catch bulk abuse early.

## 6. Two-phase security and passkeys

- **Don't make SMS OTP the long-term second factor.** It's fine as the bootstrap mechanism (the only channel you have at account creation) but SMS is vulnerable to SIM swap — and in this platform's specific case, the phone may not even reliably belong to the patient. As soon as the account is activated, prompt enrolment in a stronger credential.
- **Passkeys (WebAuthn/FIDO2) should be the recommended step-up credential.** Under the NIST SP 800-63B digital identity guidelines, synced passkeys are recognised as meeting Authenticator Assurance Level 2 (AAL2), and device-bound/hardware passkeys can reach AAL3 — both well above SMS OTP, and phishing-resistant by design (the credential is bound to the platform's actual domain, so it can't be entered into a lookalike phishing site). ([NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html), [Corbado: synced passkeys as AAL2](https://www.corbado.com/blog/nist-passkeys))
- **Different assurance levels for different roles.** Patients/delegates: passkey encouraged, SMS OTP acceptable as fallback with monitoring. GPs and specialists, who handle PHI across many patients rather than just their own: passkey or hardware security key should be mandatory (AAL2/AAL3), not optional — the blast radius of a compromised clinician account is far larger.
- **Plan for recovery.** A lost phone plus a lost passkey is a lockout, and this patient population skews toward people who need carer support in the first place — build a GP-assisted or in-clinic-kiosk recovery path with re-verification, not just a self-service "forgot passkey" flow that assumes tech-savviness.
- **Consider TDIF/Digital ID (myID) as an optional higher-assurance path.** For elevation to authorised representative, or for GP/specialist onboarding, accepting a TDIF-accredited identity provider (myID, or an accredited private provider) gets you government-grade identity proofing (IP2/IP3) without building proofing infrastructure yourself. ([TDIF overview](https://architecture.digital.gov.au/standard/trusted-digital-identity-framework-tdif))

## 7. Other platform ideas

**Interoperability, not another silo.** Build on existing Australian digital health rails — FHIR AU Core, Secure Messaging Delivery, the Healthcare Identifiers Service (IHI/HPI-I/HPI-O) — so GP and specialist practice software can talk to the platform without manual re-entry, and so it can genuinely connect to My Health Record rather than becoming a parallel system providers have to check separately. A referral platform that isn't in the GP's existing workflow tends to get abandoned in favour of fax/email within a few months.

**Fallback for non-onboarded specialists.** Not every specialist will be on the platform on day one. Have a graceful fallback — an encrypted one-time secure link or secure email — so a GP referral doesn't get stuck waiting for a specialist practice to sign up.

**AI features, used carefully.**
- Auto-extraction of structured data (diagnosis, requested investigations, urgency) from free-text referral letters, always shown alongside the original text rather than replacing it, and clearly labelled as AI-generated.
- Triage/urgency scoring to help specialists prioritise their queue, with a human always able to override.
- Duplicate-referral detection across specialists.
- A patient-facing chat for "where's my referral" style questions, with hard limits against giving clinical advice and a clean handoff to a human.
- Any AI-driven prioritisation or no-show prediction should be periodically audited for bias, since it can quietly disadvantage the same population (elderly, non-English-speaking, low digital literacy) that already needs the carer pathway most.

**Privacy and data architecture.**
- Keep identity/contact data (name, mobile, DOB) architecturally separate from clinical referral content, encrypted at rest and in transit, with Australian data residency — this matters both for the Privacy Act 1988 (Australian Privacy Principles) and for the platform's own MyGov integration story.
- Run a formal Privacy Impact Assessment before launch, and treat the consent page (item 6 in the project brief) as a living audit trail, not just a settings toggle — every grant, elevation, and revocation should be timestamped and immutable.
- Be aware that state-level health records legislation (NSW, Victoria, etc.) varies, and GPs/specialists on the platform will span states — compliance needs to account for the strictest applicable regime, not just the Commonwealth Privacy Act.

**Accessibility and trust.**
- WCAG-compliant, multi-language onboarding, given the patient population skews toward people who need carer assistance in the first place.
- An assisted-registration path (phone support or in-clinic kiosk) for patients who can't complete self-service digital onboarding at all — the two-day SMS queue window won't be enough for everyone, and a pure digital-self-service design will quietly exclude the most vulnerable patients it's meant to help.
- Use branded, recognisable SMS sending numbers/links — generic shortlinks increasingly get ignored or reported as scams, which will show up as "patients not completing setup," not as a security failure, but has the same effect.

## Sources

- [Nominated representatives – Australian Digital Health Agency](https://www.digitalhealth.gov.au/initiatives-and-programs/my-health-record/manage-your-record/privacy-and-access/nominated-representatives)
- [Authorised representatives – Australian Digital Health Agency](https://www.digitalhealth.gov.au/initiatives-and-programs/my-health-record/getting-started/authorised-representatives)
- [My Health Record for carers](https://www.myhealthrecord.gov.au/for-carers)
- [My Health Record – Authorised and Nominated Representatives — Carers Australia](https://www.carersaustralia.com.au/programs-projects/digital-health-literacy/my-health-record-authorised-and-nominated-representatives/)
- [Manage your My Health Record — OAIC](https://www.oaic.gov.au/privacy/your-privacy-rights/health-information/my-health-record/manage-your-my-health-record)
- [Trusted Digital Identity Framework (TDIF) — Australian Government Architecture](https://architecture.digital.gov.au/standard/trusted-digital-identity-framework-tdif)
- [NIST SP 800-63B — Digital Identity Guidelines: Authentication and Authenticator Management](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [Corbado — How the NIST SP 800-63B supplement enhances passkey adoption (synced passkeys as AAL2)](https://www.corbado.com/blog/nist-passkeys)
