# Cost estimate, insurance/indemnity, traceability matrix, and full gap status

*Prepared 13 August 2026*

## 1. What would this cost to set up? (indicative only — no vendor quotes yet)

There's no scoped requirements document yet, so treat every figure here as an industry-comparable ballpark, not a quote — the honest next step for a real number is getting 2–3 vendor estimates once the business requirements document (the next item on the original plan) exists. With that caveat, here's how to think about the shape of the cost:

Generic Australian healthcare app benchmarks put a **telehealth or health-data-management app at $150K–$350K**, and a **Software as a Medical Device (SaMD)-classified product at $300K–$500K+**, with security architecture (encryption, penetration testing) adding **$20K–$60K**, privacy/legal compliance work adding **$10K–$30K**, and each clinical system integration (EHR, pathology, pharmacy) adding **$20K–$50K per integration**. ([Healthcare App Development Cost — Rebelled](https://www.rebelled.com.au/guides/healthcare-app-development-cost))

ReferralPlatform is meaningfully bigger in scope than any single one of those bands — it's a **web app + a native mobile app** (roughly 1.5–2× a single-platform build), an **in-house booking engine** (not a small feature — this is its own product), and **several distinct clinical integrations**, each in that $20K–$50K-per-integration band: the Healthcare Identifiers Service (IHI/HPI-O/HPI-I), NASH-backed signing, at least one secure messaging vendor (HealthLink or Medical-Objects), the NHSD directory sync, the HealthPathways Pathway Link API, and eventually My Health Record conformance. On top of that sits the signed hash-chained audit log — a genuinely custom piece of infrastructure with no off-the-shelf equivalent to buy, closer to bespoke security-engineering effort than a standard CRUD feature.

A reasonable phased ballpark, treating each phase as separately fundable/pilotable:

| Phase | Scope | Indicative range |
|---|---|---|
| **Phase 0 — Discovery** | Business requirements doc, solution architecture, legal/compliance scoping (PIA, ToS, jurisdiction rules), 2–3 vendor quotes | $50K–$150K |
| **Phase 1 — MVP** | Web app + mobile app; account onboarding, referral creation, one secure messaging integration, NHSD sync, in-house booking module, signed audit log foundation | $400K–$700K |
| **Phase 2 — Full integration** | My Health Record conformance, full HI Service/NASH integration, HealthPathways integration, additional secure messaging vendors, TDIF/myID relying-party integration, AI features (structured extraction, later AI intake) | $250K–$450K |
| **Ongoing (post-launch, per year)** | Health-grade cloud hosting, secure messaging vendor fees, NASH certificate renewal, support/maintenance team, compliance monitoring | $150K–$400K+ |

Rough total to a fully integrated production platform: **on the order of $700K–$1.3M** before ongoing running costs — with Phase 1 alone (a genuinely useful, pilotable MVP with one PHN and a handful of practices) achievable in the $400K–$700K band. This is exactly the kind of figure worth testing against the PHN/ADHA funding pathways already researched — a regional pilot at the Phase 1 scale is a realistic ask for PHN digital-health-uplift or MRFF grant funding, whereas the full $1M+ build is a better fit for the "public-good infrastructure" pitch to ADHA directly.

One open scoping question this raises on its own: **is ReferralPlatform itself Software as a Medical Device (SaMD)?** It doesn't appear to provide diagnosis or treatment recommendations directly (that stays with the GP/specialist), which would normally place it outside TGA's SaMD definition — but the AI-assisted structured extraction and any future AI triage features sit close enough to that line that it's worth a direct TGA classification check rather than an assumption. Added to the regulator questions list.

### Two very different ways to get to that Phase 1 number — worth deciding between, not just budgeting for

The $400K–$700K Phase 1 figure means something different depending on how it's delivered, and this is worth deciding deliberately rather than defaulting into it:

- **Outsourced build (a dev agency/vendor, fixed-price or time-and-materials project).** This is the delivery model the $400K–$700K figure most directly reflects — it buys a finished MVP, but the team disperses at the end of the engagement unless separately retained, and platform knowledge walks out the door with them. Faster to start (no hiring), but weaker for a product meant to be iterated on for years and to build genuine institutional trust (PHNs, ADHA, medical defence organisations) with the people who built it.
- **In-house team (hired directly, salaried).** Retains capability and institutional knowledge, and is generally the stronger choice for something this regulator-relationship-dependent — but the same scope costs more when priced as fully-loaded salaries over a realistic build timeline, because a salaried team's cost doesn't stop when a feature is "done" the way a fixed-price vendor invoice does.

**Indicative in-house team cost, for comparison** (fully loaded — salary plus superannuation and on-costs, Australian market rates, rough order of magnitude only):

| Role | Indicative FTE cost/year | Phase 1 need |
|---|---|---|
| Product/delivery lead | $150K–$180K | 1, full-time |
| Solution architect / tech lead | $180K–$220K | 1, full-time |
| Backend engineers (referral engine, booking module, audit log) | $130K–$170K each | 2–3, full-time |
| Mobile app engineer | $130K–$160K | 1, full-time |
| Web/frontend engineer | $120K–$150K | 1, full-time |
| Integration engineer (secure messaging, HI Service/NASH, NHSD) | $140K–$180K | 1, full-time |
| UX/UI designer | $100K–$130K | 1, part-time through most of the build |
| QA/test engineer | $100K–$130K | 1, full-time from mid-build |
| Security/compliance consultant (PIA, penetration testing) | — | contract, $30K–$60K project fee |
| Legal (Terms of Service, data-sharing agreements, privacy) | — | contract, $30K–$80K project fee |

A team roughly that size, run for the 9–10 months a Phase 1 MVP realistically takes, lands in a similar ballpark to the outsourced figure once ramp-up and part-time roles are accounted for — but the two paths get there very differently, and the choice affects what's left standing (a team vs a finished artifact) once the pilot launches. Worth deciding as part of Phase 0, not defaulting into whichever quote arrives first.

### Rough timeline

| Period | Milestone |
|---|---|
| Months 1–2 | Phase 0 — requirements, architecture, legal/compliance scoping, vendor quotes if outsourcing |
| Months 3–8 | Core MVP build — onboarding, referral creation, booking module, web + mobile apps, audit log foundation, one secure messaging integration, NHSD sync |
| Months 7–9 (overlapping) | Pilot preparation — PHN partner onboarding, GP/specialist recruitment, security review/penetration test, compliance sign-off |
| Months 9–10 | Regional pilot launch — limited cohort of GPs, specialists, and patients with one PHN |
| Months 10–14 | Phase 2 integrations — My Health Record conformance, full HI Service/NASH, HealthPathways, TDIF/myID, additional secure messaging vendor |

### Rough per-module share of the Phase 1 budget

Indicative proportions of the Phase 1 build cost, not independent totals — useful for seeing where the money actually goes rather than treating "the app" as one undifferentiated cost:

- **Booking module (in-house calendar engine, preference matching, waitlist)** — roughly 20%. This is the single largest line item because it's genuinely a separate product being built in-house, not a feature bolted onto a referral form.
- **Signed, hash-chained audit log (NASH-backed)** — roughly 15%. Bespoke security engineering with no off-the-shelf equivalent to buy.
- **Account onboarding and identity/security (carer flow, OTP, passkeys, new-GP authorisation)** — roughly 15%.
- **Specialist directory and NHSD sync** — roughly 10%.
- **Referral creation and the compliance-checklist engine (incl. state-keyed rules)** — roughly 10%.
- **Specialist review and AI-assisted structured extraction** — roughly 10%.
- **Follow-up and recall engine** — roughly 10%.
- **Web and mobile app shells, cross-cutting UI/UX** — roughly 10%, spread across the above rather than a separate line, since every module ships on both surfaces.

## 2. Insurance and professional indemnity

Two different things need to be kept separate here, and conflating them is the actual risk: **clinical malpractice risk stays with the treating GP/specialist and their existing medical defence organisation (Avant, MDA National, MIGA, MIPS) — that doesn't change because a referral passed through a new platform.** What ReferralPlatform (the company) needs is insurance for its *own* risk as a technology provider — the risk that a bug, an outage, a missed notification, or a data breach causes harm, independent of anyone's clinical judgement.

**What ReferralPlatform (the company) should carry:**

- **Technology Errors & Omissions / Professional Indemnity** — covers claims that the software, or a failure in it, caused a client (a GP practice, a specialist, ultimately a patient) financial or other loss. This is the core cover for a health-tech platform and should be treated as non-negotiable before onboarding real patients.
- **Cyber liability insurance** — breach response, forensic investigation, ransomware, regulatory notification costs, and crisis communication. Particularly important given the platform's own Notifiable Data Breaches obligations under the Privacy Act (and the 72-hour aspiration flagged in the GDPR analysis) — this is what actually funds meeting those obligations if a breach happens. ([UpSure — Insurance for Australian Tech Startups](https://www.upsure.com.au/blog/definitive-guide-insurance-australian-tech-startups))
- **Management liability / Directors & Officers (D&O)** — becomes relevant once there's a board and outside capital, not needed at pure-MVP stage.
- **Public liability** — lower priority for a pure software company, but cheap enough to bundle in early.

**The genuinely unresolved question — does using ReferralPlatform affect a GP or specialist's existing indemnity cover?** This hasn't been checked at all, and it's worth checking before launch rather than after an incident. Two concrete things worth doing:

1. **Contact the major AU medical defence organisations directly (Avant, MDA National, MIGA) before launch** and ask explicitly whether a member's existing cover extends to referrals/communications made through a third-party digital platform like this, or whether it introduces any gap they'd want addressed contractually (e.g. through ReferralPlatform's own Terms of Service, or a specific endorsement to their policy).
2. **Get the platform's Terms of Service drafted to explicitly delineate responsibility**: ReferralPlatform is a conduit and clinical-decision-support tool, not a treating party — the GP/specialist retains full clinical responsibility for the referral, the advice given, and the treatment decision; ReferralPlatform is responsible for the technical availability, security, and integrity of the record. Getting this line clear and correctly worded is what actually protects both sides, more than any specific insurance product does.

Both of these have been added to the regulator/partner questions list — this is exactly the kind of conversation to have in parallel with the ADHA/PHN outreach already planned, not after it.

## 3. Traceability matrix — back to the original six project benefits

| # | Original benefit | Modules delivering it | Status |
|---|---|---|---|
| 1 | Patient doesn't need paper (though paper stays available) | Referral Creation (2), Specialist Match & Routing (3), Booking (4) — all digital by default, paper explicitly preserved as fallback per the original brief | Addressed |
| 2 | GP has clear traceability of referrals sent | Referral Creation (2) + Follow-up & Recall (6, closes the loop on outcome) + Ongoing Consent & Security (7, the signed audit log) | Addressed, strengthened by the NASH-signed hash-chained audit log |
| 3 | Specialist receives referral, doesn't need to re-scan paper | Specialist Match & Routing (3, secure messaging delivery) + Specialist Review (5, AI-assisted structured extraction) | Addressed |
| 4 | MyGov gets a single connection from this platform for traceability | Not yet designed — current work integrates myID (Digital ID) for patient login and My Health Record for document write-back, but a genuine "single national traceability connection" is a different, bigger thing that needs an actual ADHA conversation, not a design decision this project can resolve alone | **Open — the single biggest unresolved item against the original brief.** Already the lead question on the ADHA sandbox/pilot ask. |
| 5 | Fully AI enabled | AI-assisted structured extraction (5), AI phone intake design (patient-centred doc), compliance-checklist decision support (2) — each built with explicit guardrails against the Babylon Health failure mode | Addressed at multiple points, deliberately bounded rather than open-ended |
| 6 | Patient/carer consent control over who sees referrals sent/received | Onboarding (1) + Ongoing Consent & Security (7) + today's additions (linked-GP management, minors/WWCC jurisdiction rules) | Addressed, and materially strengthened today |

Worth being honest that item 4 is the one place where the project brief describes something more ambitious than anything designed so far — everything else has a real module behind it; this one still depends on a conversation ReferralPlatform doesn't control the outcome of.

## 4. Full gap status — everything flagged in the earlier "what's missing" list

| Gap | Status after today |
|---|---|
| Minors as primary patients | **Substantially addressed** — see companion doc. AHPRA exemption clarified for GP/specialist WWCC; state-keyed rule added to the compliance-checklist policy layer; Justice Dept/social-services onboarding gets an explicit WWCC capture step |
| Audit log vs. right to erasure | **Resolved** (prior turn) — crypto-shredding |
| Exception and error paths | **Resolved** — see companion doc: dual patient+GP notification, referral-scoped message thread, added to the flow |
| Urgent/emergency bypass | **Resolved** — urgent flag added at referral creation, skips preference negotiation in Booking, added to the flow |
| Interstate patient movement / multiple GPs | **Substantially addressed** — see companion doc: GP-linking with patient mobile approval, linked-GP management UI; jurisdiction-content-keyed-to-treating-GP's-state flagged as needing legal confirmation, not yet fully resolved |
| Complaints and dispute resolution | **Resolved** — see `complaints-continuity-deceased.md`: a triaged "raise a concern" entry point (clinical/AHPRA, platform support, or Privacy Officer), logged to the audit trail, added to module 7 in the flow |
| Business continuity | **Resolved** — see `complaints-continuity-deceased.md`: documented RTO/RPO targets, a source code + data escrow deed, and a structured FHIR export capability for the data that only lives on ReferralPlatform (Follow-up Plans, audit log, queued referrals); raising the escrow-holder question with ADHA/a PHN added to the regulator questions list |
| Deceased patient data handling | **Resolved** — see `complaints-continuity-deceased.md`: modelled on the existing Australian medical-records framework (executor/administrator/family/coroner access, 7-year/age-25 retention), account freeze rather than deletion (crypto-shredding explicitly never triggered by death), and automatic suppression of pending reminders/queued referrals — added to module 7 in the flow, with dashed suppression links into modules 2 and 6 |
| Professional indemnity implications | **Actioned this turn** — see Section 2 above; concrete next step (contact Avant/MDA National/MIGA) added to the regulator questions list, not yet answered |
| Traceability matrix | **Delivered** — Section 3 above |

Every item from the original "what's missing" list now has either a concrete design (with a flow representation where it's patient-facing) or a documented governance answer. The two genuinely open threads left across the whole project are the ADHA "single MyGov connection" conversation (traceability matrix, item 4) and the actual answers to the various regulator/partner/insurer questions that have been logged along the way — those depend on conversations ReferralPlatform doesn't control the outcome of, not on further design work.
