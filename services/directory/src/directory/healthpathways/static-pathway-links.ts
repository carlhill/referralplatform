/**
 * Static referral-reason → specialist-type mapping and public HealthPathways
 * landing-page links, used two ways:
 *  1. as the graceful-degradation fallback when the (mocked) HealthPathways
 *     inline-guidance API is unavailable for a given PHN region — per
 *     modules-and-requirements.md: "HealthPathways suggestions must degrade
 *     gracefully to a static link if the inline-guidance integration (Phase
 *     2 of that feature) isn't available for a given PHN region";
 *  2. as the underlying keyword-match data the mock HealthPathways client
 *     itself matches against (see mock-healthpathways-client.ts) — a real
 *     integration would call HealthPathways' own clinical-decision content,
 *     this keyword table stands in for it.
 *
 * Real HealthPathways content is PHN-licensed, clinician-authored, and kept
 * current by that program's own editorial process — this table is a small,
 * illustrative sample of common referral reasons, not a clinical decision
 * tool, and must never be presented as one. Every pathwayUrl below points at
 * HealthPathways' real public community/landing pages (not gated clinical
 * content), which is genuinely publicly linkable without a PHN login.
 */
export interface PathwayCategory {
  category: string;
  keywords: string[];
  specialistType: string;
  subspecialty: string;
  pathwayUrl: string;
}

export const PATHWAY_CATEGORIES: PathwayCategory[] = [
  {
    category: 'cardiology',
    keywords: ['chest pain', 'palpitations', 'murmur', 'heart failure', 'arrhythmia', 'hypertension', 'angina'],
    specialistType: 'Cardiologist',
    subspecialty: 'Cardiology',
    pathwayUrl: 'https://www.healthpathways.org.au/pathways/cardiology',
  },
  {
    category: 'dermatology',
    keywords: ['skin lesion', 'mole', 'rash', 'eczema', 'psoriasis', 'suspicious naevus', 'dermatitis'],
    specialistType: 'Dermatologist',
    subspecialty: 'Dermatology',
    pathwayUrl: 'https://www.healthpathways.org.au/pathways/dermatology',
  },
  {
    category: 'endocrinology',
    keywords: ['diabetes', 'thyroid', 'hba1c', 'hypothyroidism', 'hyperthyroidism', 'insulin'],
    specialistType: 'Endocrinologist',
    subspecialty: 'Endocrinology',
    pathwayUrl: 'https://www.healthpathways.org.au/pathways/endocrinology',
  },
  {
    category: 'ent',
    keywords: ['hearing loss', 'tonsil', 'sinusitis', 'vertigo', 'ear pain', 'tinnitus', 'nasal obstruction'],
    specialistType: 'ENT Surgeon',
    subspecialty: 'ENT (Otolaryngology)',
    pathwayUrl: 'https://www.healthpathways.org.au/pathways/ent',
  },
  {
    category: 'gastroenterology',
    keywords: ['reflux', 'abdominal pain', 'bowel', 'colonoscopy', 'iron deficiency', 'ibs', 'rectal bleeding'],
    specialistType: 'Gastroenterologist',
    subspecialty: 'Gastroenterology',
    pathwayUrl: 'https://www.healthpathways.org.au/pathways/gastroenterology',
  },
  {
    category: 'neurology',
    keywords: ['headache', 'migraine', 'seizure', 'numbness', 'tremor', 'dizziness', 'stroke'],
    specialistType: 'Neurologist',
    subspecialty: 'Neurology',
    pathwayUrl: 'https://www.healthpathways.org.au/pathways/neurology',
  },
  {
    category: 'orthopaedics',
    keywords: ['knee pain', 'hip pain', 'joint pain', 'fracture', 'back pain', 'shoulder pain', 'osteoarthritis'],
    specialistType: 'Orthopaedic Surgeon',
    subspecialty: 'Orthopaedic Surgery',
    pathwayUrl: 'https://www.healthpathways.org.au/pathways/orthopaedics',
  },
  {
    category: 'psychiatry',
    keywords: ['depression', 'anxiety', 'mental health', 'psychosis', 'bipolar', 'suicidal ideation'],
    specialistType: 'Psychiatrist',
    subspecialty: 'Psychiatry',
    pathwayUrl: 'https://www.healthpathways.org.au/pathways/mental-health',
  },
  {
    category: 'rheumatology',
    keywords: ['joint swelling', 'rheumatoid', 'lupus', 'gout', 'ankylosing spondylitis', 'connective tissue'],
    specialistType: 'Rheumatologist',
    subspecialty: 'Rheumatology',
    pathwayUrl: 'https://www.healthpathways.org.au/pathways/rheumatology',
  },
  {
    category: 'respiratory',
    keywords: ['shortness of breath', 'asthma', 'copd', 'cough', 'sleep apnoea', 'wheeze'],
    specialistType: 'Respiratory Physician',
    subspecialty: 'Respiratory & Sleep Medicine',
    pathwayUrl: 'https://www.healthpathways.org.au/pathways/respiratory',
  },
  {
    category: 'paediatrics',
    keywords: ['child development', 'growth concern', 'paediatric', 'failure to thrive', 'immunisation'],
    specialistType: 'Paediatrician',
    subspecialty: 'Paediatrics',
    pathwayUrl: 'https://www.healthpathways.org.au/pathways/paediatrics',
  },
];

/** Generic fallback used when no keyword in `referralReason` matches any category. */
export const GENERAL_PATHWAY_CATEGORY: PathwayCategory = {
  category: 'general',
  keywords: [],
  specialistType: 'General Physician',
  subspecialty: 'General Medicine',
  pathwayUrl: 'https://www.healthpathways.org.au/',
};

export function matchPathwayCategory(referralReason: string): PathwayCategory {
  const normalised = referralReason.toLowerCase();
  for (const category of PATHWAY_CATEGORIES) {
    if (category.keywords.some((kw) => normalised.includes(kw))) {
      return category;
    }
  }
  return GENERAL_PATHWAY_CATEGORY;
}
