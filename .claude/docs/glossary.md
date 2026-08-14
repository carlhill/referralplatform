# Glossary — acronyms and terms used across the ReferralPlatform project

*Prepared 13 August 2026. Alphabetical, plain-English. Each entry notes which project doc(s) it's most relevant to, so it doubles as an index.*

**AAL2 / AAL3 (Authenticator Assurance Level 2/3)** — NIST's tiers of how strong a login credential needs to be. AAL2 roughly means "password plus a second factor"; AAL3 means a phishing-resistant credential like a passkey/hardware key. Referenced in identity-security-recommendations.md when discussing why clinicians should be held to a higher bar than patients.

**ACIC (Australian Criminal Intelligence Commission)** — runs the national police-checking service and is building the National Continuous Checking Capability for Working with Children Checks. See minors-multigp-exception-paths.md.

**ADHA (Australian Digital Health Agency)** — the Australian Government body responsible for national digital health strategy, My Health Record, and the Healthcare Identifiers Service. The primary regulator/partner conversation this project needs to have. See business-case-competition.md and adha-regulator-questions-todo.md.

**AHPRA (Australian Health Practitioner Regulation Agency)** — regulates and publicly registers Australia's health practitioners (doctors, nurses, etc.). Its public register is the free, individual, on-demand way to verify a specialist's registration — not a bulk data source. See specialist-directory-booking.md.

**APP (Australian Privacy Principles)** — the 13 principles under the Privacy Act 1988 that form Australia's core privacy law, and the legal foundation this platform's design has been built on throughout. See gdpr-applicability.md for how these compare to GDPR.

**Crypto-shredding** — the technique used to reconcile an immutable, hash-chained audit log with a patient's right to correction/deletion: encrypt sensitive fields with a per-user key, then "delete" by destroying the key rather than the log entry. See audit-pathology-medicare-deepdive.md.

**D&O (Directors & Officers insurance)** — covers company directors/officers personally against claims arising from decisions made running the company. Becomes relevant once there's a board and outside investors. See cost-insurance-traceability.md.

**DPIA (Data Protection Impact Assessment)** — GDPR's mandatory risk assessment for high-risk data processing. The Australian near-equivalent is a PIA (below). See gdpr-applicability.md.

**DPO (Data Protection Officer)** — a role GDPR mandates for organisations doing large-scale processing of special-category data (which health data is). The Privacy Act has no equivalent mandate; the OAIC recommends a lighter-touch Privacy Officer instead. See gdpr-applicability.md.

**EMPI (Enterprise Master Patient Index)** — the deduplication discipline used to make sure the same patient doesn't end up with two accounts. This platform's EMPI key is the IHI (below), not the Medicare number, because Medicare numbers cover a family, not an individual. See audit-pathology-medicare-deepdive.md.

**E&O (Errors & Omissions insurance)**, also called Technology E&O or professional indemnity for tech — covers claims that the software (or a failure in it) caused a customer financial or other loss. The core insurance policy recommended for the platform itself. See cost-insurance-traceability.md.

**FHIR (Fast Healthcare Interoperability Resources)** — the international standard data format for exchanging clinical information electronically. "FHIR AU Core" is the Australian profile of it. Referenced as the format that gives ReferralPlatform's referral records genuine portability. See identity-security-recommendations.md and gdpr-applicability.md.

**GDPR (General Data Protection Regulation)** — the EU's data protection law. Assessed in detail in gdpr-applicability.md; conclusion is it doesn't currently apply to an Australia-only platform.

**HealthPathways** — the PHN-funded clinical/referral guidance tool most Australian GPs already use, which tells them when and where to refer for a given condition. Recommended integration point (not a competitor) via its Pathway Link API. See onboarding-processes.md.

**HI Service (Healthcare Identifiers Service)** — the government service that issues IHIs, HPI-Os, and HPI-Is (below). See audit-pathology-medicare-deepdive.md.

**HPI-I (Healthcare Provider Identifier – Individual)** — the unique identifier issued to an individual registered health practitioner (a GP or specialist), via the HI Service. See onboarding-processes.md.

**HPI-O (Healthcare Provider Identifier – Organisation)** — the unique identifier issued to a healthcare organisation (a GP practice, or ReferralPlatform itself), via the HI Service. Required for a practice to trigger patient accounts or referrals in the fraud-prevention design. See audit-pathology-medicare-deepdive.md and onboarding-processes.md.

**IHI (Individual Healthcare Identifier)** — the unique patient identifier issued via the HI Service, automatically assigned to virtually everyone with Medicare/DVA enrolment. Recommended as the platform's internal identity key instead of the Medicare number, and as the deduplication key for EMPI. See audit-pathology-medicare-deepdive.md.

**IRAP (Information Security Registered Assessors Program)** — the Australian Government's cloud/system security assessment framework, referenced as the kind of hosting standard a health-grade platform should meet. See cost-insurance-traceability.md.

**K738 / K739** — the Ontario (Canada) OHIP billing codes for the eConsult program: K738 pays the referring GP ($16), K739 pays the responding specialist ($20.50). Cited as the strongest real-world precedent for the eConsult/advice-only pathway. See business-case-competition.md.

**MBS (Medicare Benefits Schedule)** — the list of Medicare-subsidised services and their rebates, including the referral-validity rules (12 months for a standard specialist referral, 3 months specialist-to-specialist, indefinite for stable chronic conditions) and the telehealth "12-month relationship rule." See patient-centered-recall-ai-intake.md.

**MDO (Medical Defence Organisation)** — the bodies that provide Australian doctors' professional indemnity insurance (Avant, MDA National, MIGA, MIPS). Distinct from any insurance ReferralPlatform itself needs to carry. See cost-insurance-traceability.md.

**MHR (My Health Record)** — Australia's national electronic health record system. Referenced for its conformance pathway (for writing referral documents), its poll-based (not push) access model, and its representative/consent model as the template for this project's carer design. See identity-security-recommendations.md and audit-pathology-medicare-deepdive.md.

**MRFF (Medical Research Future Fund)** — an Australian Government fund that includes digital health trial funding, one of the grant pathways worth pursuing for a pilot. See business-case-competition.md.

**myID** — the Australian Government's Digital ID app (formerly myGovID), a TDIF-accredited identity provider. ReferralPlatform's recommended path is to accept myID logins as a "relying party" rather than seeking its own TDIF accreditation. See business-case-competition.md.

**NASH (National Authentication Service for Health)** — Australia's existing government-run PKI for healthcare, used to digitally sign documents/transactions. The mechanism recommended for signing entries in the platform's audit log. See audit-pathology-medicare-deepdive.md.

**NCSR (National Cancer Screening Register)** — the government-run automated screening-reminder system cited as real-world precedent for the platform's own automated pathology/follow-up reminders. See patient-centered-recall-ai-intake.md.

**NDB (Notifiable Data Breaches scheme)** — the Australian Privacy Act's breach-notification regime ("as soon as practicable," no fixed deadline) — contrasted with GDPR's stricter 72-hour requirement. See gdpr-applicability.md.

**NHSD (National Health Services Directory)** — Healthdirect Australia's official, publicly-API-accessible directory of practitioners and services. Recommended as the base layer for the specialist directory, synced via scheduled batch job. See specialist-directory-booking.md.

**PHN (Primary Health Network)** — one of 31 regional bodies that fund and coordinate primary care across Australia, including running HealthPathways and practice-support programs. Central to both the funding pitch and the practical integration/adoption strategy. See business-case-competition.md and onboarding-processes.md.

**PIA (Privacy Impact Assessment)** — the Australian, OAIC-recommended best-practice risk assessment for high-privacy-risk projects; the near-equivalent of GDPR's mandatory DPIA. Recommended to be commissioned in Phase 0. See gdpr-applicability.md and cost-insurance-traceability.md.

**PKI (Public Key Infrastructure)** — the cryptographic signing/certificate system underpinning NASH-backed digital signatures and the audit log's non-repudiation design. See audit-pathology-medicare-deepdive.md.

**PRODA (Provider Digital Access)** — the login system used to access Services Australia's HPOS portal (including manual MyMedicare administration) — noted as the fallback since no public MyMedicare API was confirmed. See patient-centered-recall-ai-intake.md.

**SaMD (Software as a Medical Device)** — the TGA's regulatory category for software that itself provides diagnosis or treatment functions. ReferralPlatform likely sits outside this definition, but the AI features are close enough to the line to need a direct classification check. See cost-insurance-traceability.md.

**TDIF (Trusted Digital Identity Framework)** — the Australian Government's accreditation framework for digital identity providers (like myID). Full accreditation is a heavy, later-stage option; the lightweight path is being a "relying party" instead. See identity-security-recommendations.md.

**TGA (Therapeutic Goods Administration)** — Australia's medical-device/therapeutic-goods regulator, relevant to the SaMD classification question above.

**WWCC (Working with Children Check)** — the state-issued screening check for people working with children. AHPRA-registered GPs/specialists are exempt in most (not all) states; it fully applies to non-clinical Justice Dept/social-services staff onboarding in Phase 2. See minors-multigp-exception-paths.md.
