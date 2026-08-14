# Complaints & disputes, business continuity, and deceased patient data — added to the solution

*Prepared 13 August 2026. Resolves the three remaining "Still open" items from the gap-status table in cost-insurance-traceability.md.*

## 1. Complaints and dispute resolution

The direction already flagged holds up: don't build a parallel complaints body — route clinical-conduct complaints to the bodies that already exist for that purpose. What was missing was the actual in-platform mechanism, so here it is.

**A single "Raise a concern" entry point, available from any referral or from the consent/security page, that triages before it routes:**

1. **Concern type is captured first** — three categories, each routed differently:
   - **Clinical care or conduct** (e.g. disagreement with a specialist's advice, concern about how a consultation was handled) → routed externally, with a pre-filled summary, to **AHPRA** or the relevant **state health complaints commissioner**. ReferralPlatform doesn't adjudicate clinical disputes; it gets the patient to the body that does, faster than they'd find it themselves.
   - **Platform/technical issue** (a referral stuck, a booking that didn't sync, a notification that never arrived) → routed internally to ReferralPlatform's own support, since this is genuinely the platform's responsibility, not the clinician's.
   - **Privacy or consent breach** (someone saw a referral they shouldn't have, a carer link that shouldn't have been approved) → routed internally to a **named Privacy Officer** role (the Australian Privacy Act equivalent of GDPR's DPO, already discussed in the GDPR doc) — with a path to escalate to the **OAIC** if it's not resolved internally.
2. **Every concern, regardless of category, is logged to the same signed audit trail as everything else** — what was raised, when, how it was triaged, and its outcome. This is what makes "raise a concern" trustworthy rather than a black hole: the patient (or GP) can see it was actually handled, not just submitted.
3. **The GP is copied on clinical-care concerns raised by their patient** (with the patient's existing consent settings respected) — since in practice the GP is often the first person a patient would otherwise have called anyway, and keeping them in the loop is more useful than routing entirely around them.

This has been added to the Ongoing Consent & Security module in the flow (module 7), since it's a continuous capability like the rest of that module, not a one-off step.

## 2. Business continuity

This is a governance/legal deliverable, not a technical feature — but it needs a concrete answer before real patients are onboarded, not a vague commitment. Three specific things to put in place:

**A documented Business Continuity / Disaster Recovery plan with real numbers, not just a policy statement** — a defined Recovery Time Objective (how long an outage can last before it's a real problem for in-flight care) and Recovery Point Objective (how much data loss is tolerable in a failure). For a platform sitting in an active clinical pathway, these numbers should be tight, and should be published to onboarded PHNs/practices as part of the platform's own accountability — not just kept internally.

**A source code and data escrow deed** — a neutral third party holds ReferralPlatform's source code and a current copy of patient/referral/audit data, released to onboarded PHNs/practices (or a nominated successor operator) only if specific, objectively defined events occur: insolvency, sustained failure to deliver support, or discontinuation of the product. This is standard practice for enterprise/government SaaS customers who depend on a vendor for something mission-critical, and it directly answers "what happens to in-flight referrals and Follow-up Plans if the company doesn't continue." ([Sprintlaw — Source Code Escrow Agreements for Australian SaaS](https://sprintlaw.com.au/articles/source-code-escrow-agreements-what-australian-saas-businesses-should-include/))

**Worth naming explicitly: escrow matters more for some data than others, because of a design decision already made.** A referral routed via existing secure messaging rails (HealthLink/Medical-Objects) already lands in the specialist's own practice software the moment it's sent — that copy exists independently of ReferralPlatform, so it isn't actually at risk in a continuity event. What genuinely only lives on ReferralPlatform, and therefore needs the escrow/continuity commitment most, is: the Follow-up Plan and recall schedule (module 6), the audit log itself, and any referral still in the pre-routing queue. A **structured export capability** (FHIR-formatted, so it's actually usable by another system, not just a data dump) for exactly this data should be built as a platform feature in its own right, not left purely as a legal fallback — it's also useful for the ordinary case of a GP practice or specialist wanting their own records out, independent of any continuity event.

**Given the platform's own "public-good infrastructure" positioning already used in the ADHA/PHN funding pitch, it's worth raising directly with ADHA or a PHN partner whether they'd be willing to act as (or nominate) the escrow holder** — that would make the continuity commitment credible to every other PHN or practice being asked to onboard, in a way a purely private commercial escrow arrangement can't quite match. Added to the regulator/partner questions list.

## 3. Deceased patient data handling

Researched this properly rather than guessing, since "model it on My Health Record" turned out to be less directly answerable than expected — My Health Record's own public guidance doesn't spell out its deceased-patient process in accessible detail. The better-grounded model is the existing Australian medical-records framework doctors already operate under, which the platform should mirror rather than invent something new:

- **The duty of confidentiality continues after death** — a deceased patient's record doesn't become open or public, and it doesn't get auto-deleted either. This matters directly for the crypto-shredding design already built: **death should never trigger crypto-shredding.** Erasure is a *living* patient's right to exercise; a deceased patient's record needs to be preserved, not destroyed, for medico-legal and family reasons.
- **Access after death is restricted to specific authorised parties, and it's state-variable** — in Victoria and the ACT, only the **executor or administrator of the estate** can request access; in NSW and other states, **immediate family** can also request it, and doctors may share limited information with relatives on compassionate grounds even outside a formal request. The **coroner** has statutory access during a death investigation. ([Avant — Deceased patients and their medical records](https://avant.org.au/resources/deceased-patients-and-their-medical-records))
- **Retention: a 7-year minimum from the last entry is the recommended national standard** (drawn from NSW/Victoria/ACT legislation) — and for a patient who was a minor at their last entry, records should be retained **until they would have turned 25**. This second rule connects directly to the minors-as-primary-patients design already added — worth adopting both numbers as ReferralPlatform's own retention policy now rather than revisiting it later. ([Avant — Deceased patients and their medical records](https://avant.org.au/resources/deceased-patients-and-their-medical-records))

**What this means for the platform, concretely:**

1. **A GP flags a patient as deceased** (the natural first-notice point, same as in paper-based practice today). This immediately: freezes the account (no further patient/carer/delegate logins), suppresses every pending reminder in the Follow-up & Recall module (module 6) — a real, near-term, easily justified win: the platform should never send a blood-test reminder to someone who has died — and administratively closes any referral still sitting in the 2-day activation queue, with a note rather than a silent lapse.
2. **Linked carers/delegates lose access automatically** at the same moment, consistent with the executor/administrator-only model in most states — ongoing carer access doesn't carry over past death by default.
3. **Any further access is a human-reviewed request, not self-service** — modelled directly on the executor/administrator/immediate-family/coroner framework above, state-keyed the same way the WWCC and compliance-checklist rules already are, with identity/authority verified (grant of probate, letters of administration, or a coroner's/police request) before anything is released.
4. **Every step — the death flag, the freeze, the suppression, and any subsequent access request and its outcome — is logged to the signed audit trail.** This is the same accountability mechanism used everywhere else in the design; there's no reason deceased-patient handling should be the one place that isn't traceable.

## Updated flow and gap status

Two new nodes have been added to the Ongoing Consent & Security module (module 7) in the business process flow: the "Raise a concern" triage entry point, and the "GP flags patient deceased" trigger, with dashed links showing it suppressing pending reminders and queued referrals elsewhere in the flow. Business continuity doesn't have a patient-facing flow step — it's a governance commitment — so it isn't represented in the diagram, the same way insurance and cost aren't.

All three items in the gap-status table are now marked resolved rather than open. See the updated `cost-insurance-traceability.md`.
