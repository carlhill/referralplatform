# Australian state/territory statutory information-sharing schemes — reference corpus

*Prepared 13 August 2026 — research starting point, not legal advice. Verify every clause against the current legislation and get formal legal review before relying on any of this operationally. This is a Phase 2 reference (see phase2-justice-social-services.md) and not something the current health platform build needs.*

## How to "interrogate" this

Building a separate custom LLM isn't really what's needed here, and it would be the expensive way to get what you actually want. This document (and the ones already in this project) sit inside a Claude Project, and Claude Projects already do retrieval over saved docs — that's what `project_search` is doing under the hood whenever a Claude session is attached to this project. In practice that means: open a new chat attached to this same Project (or continue this one), and just ask your question in plain language — "under NSW's Chapter 16A, can a school share information with NDIS about a specific child without the parent's consent?" — and Claude will search this corpus (and the other project docs) and answer from it, citing which scheme and section it came from. That's the "interrogate the rules" experience you're after, and it already works today with zero additional build. If you later want a standalone tool that doesn't require going through Claude at all — say, something your compliance team opens directly — that's a separate, larger build (a small web app with its own search and its own LLM API key) and worth scoping only once you know this domain is actually going ahead; say the word and I'll price that out properly rather than guessing here.

## Coverage and confidence

Victoria, NSW, and Queensland below are reasonably well-sourced from named legislation and government guidance pages. Western Australia, South Australia, the NT, Tasmania, and the ACT are lighter — the searches available to this session surfaced administrative guidelines and practice manuals rather than a single named "scheme" in every case, which may reflect how those jurisdictions have actually structured this (guideline-based rather than a single named statutory scheme), or may just reflect gaps in what surfaced. Treat everything below the Queensland entry as a starting point for a lawyer to verify, not a settled answer.

## Victoria — Child Information Sharing Scheme (CISS)

- **Legislative basis:** Child Wellbeing and Safety Act 2005 (as amended), sitting alongside a related Family Violence Information Sharing Scheme.
- **Mechanism:** Removes the consent requirement — a practitioner does not need the family's consent to share information "where the practitioner considers the sharing would promote the wellbeing or safety of a child."
- **Who can participate:** Only organisations formally prescribed by regulation as an "Information Sharing Entity" (or the narrower "Restricted Information Sharing Entity") — not a self-declared status.
- **What it overrides:** Specific provisions of the Privacy and Data Protection Act 2014 and the Health Records Act 2001 — exempting entities from direct collection and notification requirements, and allowing sensitive information to be shared without normal consent.
- **Limits:** "Excluded information" categories are carved out; the safety-over-privacy principle applies specifically to this purpose, not as a blanket rule.
- **Sources:** [OVIC — Child Information Sharing Scheme and Privacy](https://ovic.vic.gov.au/privacy/resources-for-organisations/child-information-sharing-scheme-and-privacy/), [vic.gov.au — Child Information Sharing Scheme](https://www.vic.gov.au/child-information-sharing-professionals), [CP Manual Victoria](https://www.cpmanual.vic.gov.au/our-approach/information-sharing/child-information-sharing-scheme-and-child-protection)

## New South Wales — Chapter 16A

- **Legislative basis:** Chapter 16A of the Children and Young Persons (Care and Protection) Act 1998.
- **Mechanism:** Enables "prescribed bodies" to exchange information relating to a child's safety, welfare, or wellbeing without individual consent, where it assists another prescribed body to make a decision, assessment, or plan, conduct an investigation, or provide a service relating to a child's safety, welfare or wellbeing (or manage risks to children in an employer/designated-agency capacity).
- **Who's prescribed (as at the most recent listing found):** Commonwealth agencies including the Australian Federal Police, the Department of Health and Aged Care, the Department of Social Services, the NDIA, and the NDIS Quality and Safeguards Commission, plus disability services providers and NSW government and non-government child welfare organisations. This list is set by regulation and changes over time — verify the current list directly rather than relying on this snapshot.
- **Consent:** Not required between prescribed bodies for the purposes above — a structural authorisation, not a case-by-case permission.
- **Sources:** [NSW Bar Association — Chapter 16A factsheet](https://inbrief.nswbar.asn.au/posts/7fe49807df877cb7bb81940d2e715f6c/attachment/Factsheet.pdf), [NSW Dept of Education — Information sharing under Chapter 16A](https://education.nsw.gov.au/early-childhood-education/regulation-and-compliance/information-sharing-under-chapter-16a), [Office of the Children's Guardian — Ch16A information sharing](https://ocg.nsw.gov.au/organisations/reportable-conduct-scheme/religious-bodies-and-ch16a-information-sharing)

## Queensland — two separate schemes, not one

Queensland runs child-safety information sharing and domestic/family-violence information sharing as **two distinct legal mechanisms** — worth noting because it's a different shape from Victoria's single combined framework:

- **Child safety:** Information sharing under the **Child Protection Act 1999 (Qld)**, with its own departmental procedure and guidelines published by the Department of Families, Seniors, Disability Services and Child Safety.
- **Domestic and family violence:** A separate mechanism under **Part 5A of the Domestic and Family Violence Protection Act 2012**, with its own information-sharing guidelines (most recently updated 2023) and a further 2024 legislative update (Act 2024 No. 49) suggesting this area is still actively being amended — check for the current version before relying on any specific provision.
- **Sources:** [Qld — Information sharing under the Child Protection Act 1999 procedure](https://ppr.qed.qld.gov.au/pp/information-sharing-under-the-child-protection-act-1999-qld-procedure), [Qld — Sharing information with specific agencies](https://www.families.qld.gov.au/about-us/our-department/partners/information-sharing/sharing-information-specific-agencies), [Qld — DFV information sharing guidelines](https://www.families.qld.gov.au/our-work/domestic-family-sexual-violence/for-service-providers/integrated-service-responses/dfv-information-sharing-guidelines), [Domestic and Family Violence Protection Act 2012, Part 5A](https://www.ccc.qld.gov.au/sites/default/files/Docs/Public-Hearings/Impala/Exhibits/Operation-Impala-Exhibit-141-Domestic-and-Family-Violence-Protection-Act-2012-Part-5A-Information-Sharing-Guidelines.pdf)

## Western Australia — lower confidence, needs direct follow-up

Search surfaced WA Health's "Guidelines for Protecting Children 2020" and general commentary, but not a single, clearly-named statutory scheme equivalent to Victoria's CISS or NSW's Chapter 16A. WA appears to operate more through sector-specific mandatory-reporting and guideline frameworks than one named cross-sector information-sharing act — this needs direct verification with a WA-based lawyer or the WA Department of Communities before assuming any particular mechanism applies. ([CAHS WA — Guidelines for Protecting Children 2020](https://cahs.health.wa.gov.au/~/media/HSPs/CAHS/Documents/Health-Professionals/Child-Protection/Guidelines-for-the-Protection-of-Children-2020.pdf))

## South Australia — lower confidence, needs direct follow-up

SA appears to operate via administrative "Information Sharing Guidelines" issued by Treasury and the Department for Child Protection, rather than a single named legislative scheme — multiple agency-specific guideline documents were found (Education, Child Protection, Treasury) rather than one authoritative cross-government source. Worth a direct enquiry to SA's Department of Treasury and Finance (which appears to own the guidelines) or the Department for Child Protection. ([SA Treasury — About the Information Sharing Guidelines](https://www.treasury.sa.gov.au/Our-services/information-sharing-data-analytics/information-sharing-in-south-australia/information-sharing-guidelines/about-the-information-sharing-guidelines), [SA Department for Child Protection — Information sharing guidelines](https://childprotection.sa.gov.au/research-and-publications/publications/information-sharing-guidelines))

## Northern Territory — lower confidence, needs direct follow-up

NT publishes "Domestic and Family Violence Information Sharing Guidelines" through its Department of Children and Families, again appearing administrative/guideline-based rather than a single named statutory scheme in what surfaced here. ([NT — Domestic and family violence information sharing](https://families.nt.gov.au/domestic-family-and-sexual-violence/informationsharing))

## Tasmania — lower confidence, needs direct follow-up

Tasmania's most recent relevant reform found is the **Child and Youth Safe Organisations Framework**, which passed Tasmanian Parliament following the state's Commission of Inquiry response — this is closer to an organisational-safety-standards framework than an information-sharing consent-override scheme, so it may not be the direct Tasmanian equivalent of Victoria's CISS. Needs direct follow-up to confirm whether Tasmania has a separate information-sharing mechanism alongside this framework. ([Tas — Child and Youth Safe Organisations Framework](https://www.oir.tas.gov.au/about/the-child-and-youth-safe-organisations-framework))

## Australian Capital Territory — not found

No ACT-specific scheme surfaced in this round of research. Needs direct follow-up with ACT Community Services.

## What this means for platform design (recap from phase2-justice-social-services.md)

Even from this partial picture, three things are already clear enough to design around: the schemes are genuinely not uniform (Victoria and NSW alone differ in legislative basis, entity-recognition mechanism, and structure; Queensland splits child safety and family violence into two separate mechanisms where Victoria combines them); at least two jurisdictions (WA, SA) appear to run on administrative guidelines rather than a single overriding Act, which likely means a different, possibly weaker legal override of privacy obligations than Victoria's or NSW's explicit statutory carve-outs; and several jurisdictions need a direct enquiry rather than public search to pin down accurately. All of this reinforces treating the policy-override layer as pluggable per jurisdiction, and running the legal verification as a dedicated workstream with a lawyer in each relevant state before any engineering commitment, exactly as flagged in the Phase 2 document.
