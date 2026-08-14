# UI design — design system and screen inventory

*Prepared 13 August 2026. A working HTML mockup covering the key screens across all three surfaces is delivered alongside this doc, built to the design system described here.*

## Design principles

- **Calm and trustworthy over flashy.** This is health infrastructure people rely on when anxious (waiting on a specialist referral, chasing test results) — the visual language should read as competent and unhurried, not like a consumer growth-hacked app. Generous whitespace, restrained colour, no dark patterns (no artificial urgency, no notification-badge inflation).
- **Accessible by construction, not by retrofit.** WCAG 2.1 AA minimum, but designed for a patient population that skews older than a typical consumer app's: larger default touch targets and text sizes than usual, high colour contrast, no reliance on colour alone to convey status (icons/text labels always paired with colour).
- **The three surfaces share a visual language but are not the same product.** The GP/specialist portals are professional, dense-information, daily-use tools (more like practice-management software) — the patient app is sparse, reassuring, and infrequifrequently used (someone opens it when something's happening with their care, not every day) — the information density and interaction pace should reflect that difference deliberately.

## Visual system

- **Colour**: a restrained clinical-blue/teal primary palette (calm, widely associated with healthcare trust without being clichéd hospital-green), a single accent colour reserved for primary actions only, and a clearly distinct semantic set for status (success/green, attention/amber, urgent/red) — used consistently and never for decoration.
- **Typography**: a single, highly legible system font stack (system-ui) rather than a custom webfont — faster load, better accessibility across devices, and one less dependency. Minimum body text size larger than typical consumer-app defaults, given the audience.
- **Components**: built on Radix UI primitives (per the tech stack doc) with a consistent 8px spacing scale, rounded-but-not-playful corners, and clear visual hierarchy between primary actions (referral status, "approve GP link," "confirm booking") and secondary ones (view details, message thread).
- **Iconography**: a single consistent icon set throughout (e.g. Lucide, which pairs naturally with Radix) — never mixing icon styles between surfaces.

## Screen inventory by surface

### Patient/carer mobile app (+ companion web)

1. **Onboarding** — SMS-link landing → DOB/Medicare verification → patient-vs-carer question → OTP entry → passkey enrolment prompt.
2. **Home/dashboard** — active referrals at a glance (status: queued / routed / booked / seen / follow-up due), with the single most time-sensitive action surfaced first (an approval needed, an upcoming appointment, a reminder due).
3. **Referral detail** — timeline view of a single referral's history (drawing directly from the audit log's event schema), the message thread, and any action needed.
4. **Booking** — preference capture (day/time), matched-slot offer or waitlist status, calendar add.
5. **New GP approval** — the push-notification-triggered approval screen (Section 1B of the flow).
6. **Consent & security page** — linked GPs/practices list with revoke, per-referral visibility controls, passkey/security settings.
7. **Raise a concern** — the triage entry point (plain-language questions, not a category picker).
8. **Document vault** — referral letters and related documents, exportable.

### GP web portal

1. **Patient search/lookup** — including the new-account-trigger flow and the existing-account GP-link request.
2. **Referral creation** — the compliance-checklist prompt, the HealthPathways-suggested specialist type, urgent-flag toggle, consent capture.
3. **Referral list/dashboard** — practice-wide view of sent referrals and their status, filterable, exportable.
4. **Follow-up & recall dashboard** — the "courtesy call due" list, tests overdue, patients needing GP action.
5. **Message threads** — inbox view across all active referral-scoped conversations.
6. **Deceased-patient flag** — the workflow to flag a patient and trigger the freeze/suppression sequence.
7. **Practice settings** — HPI-O verification status, integration tier, calendar connection, PHN affiliation.

### Specialist web portal

1. **Incoming referral queue** — with the AI-assisted structured extraction summary shown first, full letter available on demand.
2. **Referral decision** — accept / respond with advice (eConsult) / decline-with-reason.
3. **Booking calendar management** — availability, waitlist, confirmed bookings.
4. **Follow-up Plan creation** — structured next-review-date, required-tests, referral-type fields.
5. **Directory profile management** — self-maintained listing (location, days, subspecialty) that supersedes NHSD sync data.

### Admin/Ops Console (internal staff — lower design priority, functional-first)

1. AHPRA/WWCC manual verification queue.
2. Deceased-patient access-request review (executor/family/coroner).
3. PHN/practice onboarding pipeline.
4. Audit log query tool.

## What the delivered mockup covers

Given the scope, the HTML mockup focuses on the screens that best demonstrate the design system and the platform's distinguishing features rather than all ~24 screens: the patient dashboard and referral detail/timeline, the new-GP-approval screen, the GP referral-creation screen (compliance checklist + HealthPathways suggestion), and the specialist incoming-referral view (AI-assisted extraction). The remaining screens follow the same component system and are lower-risk to build directly from this spec.
