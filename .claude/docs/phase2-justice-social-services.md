# Phase 2 (future scope, not MVP): extending the Referral Platform to justice and community/social services

*Prepared 13 August 2026 — captured as a forward-looking scope note, not a near-term commitment*

## The idea

The same underlying pattern the ReferralPlatform solves for health — one party refers a person to another organisation, and someone wants a trustworthy, trackable record that the referral was received and actioned — shows up in other domains: a Department of Justice referring a person (or a child) to a support organisation, St Vincent de Paul or a similar charity referring a family to childcare or financial support services, or organisations referring migrants to settlement services. The underlying "referral plumbing" (create referral → notify receiving org → track status → close the loop) is genuinely reusable across these domains, and mature prior art already exists proving the pattern works operationally — Infoxchange's statewide deployment for Queensland's child protection and family services department, and the US's findhelp.org and Unite Us in the health-to-social-care space, are all working, adopted examples of this same closed-loop referral model outside health (see the main business case document for detail).

## Why this cannot simply reuse the health platform's consent model

The health platform's design (from the earlier identity/security recommendations) is built around a specific assumption: the patient owns their data, and every disclosure needs their consent, mediated through a consent page and a carer/delegate permission model. That assumption breaks in justice and child-protection contexts, where information sharing is frequently **mandatory and non-consensual by design** — the whole point of the legislation is that a child's safety, or a statutory investigation, doesn't wait for the subject (or their parent) to agree to it.

Victoria's **Child Information Sharing Scheme (CISS)** is a concrete, well-documented example of how this actually works, and is worth using as the reference model:

- It operates under Victoria's Child Wellbeing and Safety Act 2005, alongside a parallel Family Violence Information Sharing Scheme.
- It removes the normal consent requirement: a practitioner does not need the family's consent to share information "where the practitioner considers the sharing would promote the wellbeing or safety of a child."
- Organisations can't just declare themselves covered — they must be formally prescribed by regulation as an "Information Sharing Entity" (or a "Restricted Information Sharing Entity" with narrower powers) before they're authorised to share or receive information under the scheme. That's a government recognition process, not a self-service signup.
- It specifically overrides parts of Victoria's general privacy law (the Privacy and Data Protection Act 2014 and the Health Records Act 2001) — exempting entities from collecting information directly from the individual, removing collection-notification requirements, and allowing sensitive information to be shared without the consent that would normally be required.
- It is not unlimited: certain "excluded information" categories are carved out, and the guiding principle is that safety takes precedence over privacy specifically *for this purpose*, not as a blanket rule.

([Child Information Sharing Scheme and Privacy — OVIC](https://ovic.vic.gov.au/privacy/resources-for-organisations/child-information-sharing-scheme-and-privacy/), [Child Information Sharing Scheme — vic.gov.au](https://www.vic.gov.au/child-information-sharing-professionals))

## The practical implication for a future build

Two things follow directly from this, and both should be treated as real engineering and legal constraints, not edge cases to configure later:

1. **This is not one national scheme.** Victoria's CISS is a Victorian-specific legislative mechanism. Other states and territories have their own, broadly similar but not identical, statutory information-sharing regimes (for example, NSW has its own prescribed-body information-sharing provisions under its children's care and protection legislation). A platform operating across states would need a jurisdiction-by-jurisdiction legal map — different legislative basis, different entity-recognition/prescription process, different thresholds for when consent can be overridden, different "excluded information" categories — not a single national ruleset. This needs its own legal workstream, run state by state, well before any engineering work starts in this domain.

2. **The policy layer needs to be pluggable, not a toggle on the health consent page.** The referral-tracking engine (who gets notified, what status it's in, whether it was actioned) can genuinely be domain-agnostic and shared across health, justice, and social services. But the layer that decides *who is allowed to see or share what, and under what legal authority* cannot be — it needs to support fundamentally different models side by side: patient-controlled consent (health), and statutory mandatory sharing subject to entity prescription and defined risk thresholds (child protection/justice). Building this as a single configurable policy module from the start, rather than retrofitting a consent-based design later, will save a substantial rebuild if this domain is ever pursued.

## Recommended sequencing

Treat this as literal Phase 2: prove the health platform (patient accounts, carer/delegate model, GP/specialist adoption, ideally a PHN/ADHA relationship) first, where the legal and identity problems are already well-scoped. Only take on justice/social-services expansion once that foundation is solid, and run the state-by-state legal mapping as its own dedicated workstream in parallel with any technical build — not as something absorbed into the existing product team's roadmap alongside health features.

## Sources

- [Child Information Sharing Scheme and Privacy — Office of the Victorian Information Commissioner](https://ovic.vic.gov.au/privacy/resources-for-organisations/child-information-sharing-scheme-and-privacy/)
- [Child Information Sharing Scheme — vic.gov.au](https://www.vic.gov.au/child-information-sharing-professionals)
- [Child Information Sharing Scheme and Child Protection — CP Manual Victoria](https://www.cpmanual.vic.gov.au/our-approach/information-sharing/child-information-sharing-scheme-and-child-protection)
- [Infoxchange — Keeping children and families safe](https://www.infoxchange.org/au/impact-stories/keeping-children-and-families-safe)
- [findhelp.org](https://www.findhelp.org/)
- [Unite Us — Providers](https://uniteus.com/industries/providers/)
