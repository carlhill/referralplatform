/**
 * Structured extraction output — module #10/#5's "AI-assisted structured
 * extraction of referral content for the specialist". Deliberately shaped
 * as data the specialist reviews and confirms, never as instructions the
 * platform acts on directly — see CasesService's confirmation gate and the
 * Babylon Health guardrail documented in BUILD_LOG/specialist-review.md.
 */
export interface ExtractedPatientInfo {
  name?: string;
  dateOfBirth?: string;
  sex?: string;
  /** Any other patient identifiers found in the text (e.g. a Medicare number), verbatim. */
  otherIdentifiers?: string[];
}

export interface ExtractedReferringGp {
  name?: string;
  practice?: string;
  providerNumber?: string;
  contact?: string;
}

export interface ExtractionOutput {
  patient: ExtractedPatientInfo;
  /** The extractor's best attempt at the reason for referral, distinct from any structured hint the caller supplied. */
  reasonForReferral?: string;
  /** Bullet-point key history items, in the order found in the source text. */
  keyHistory: string[];
  /** Current medications, as found in the source text. */
  medications: string[];
  referringGp: ExtractedReferringGp;
  /**
   * Keyword-matched urgency/red-flag indicators found in the text (e.g.
   * "chest pain", "urgent"). Purely informational surfacing for the
   * specialist — this service NEVER uses this to triage, prioritise, or
   * take any action on its own; see the Babylon Health guardrail note in
   * BUILD_LOG/specialist-review.md.
   */
  urgencyIndicators: string[];
  /** 0-1 heuristic confidence the provider reports on its own extraction, purely informational. */
  confidence: number;
  /** Human-readable notes on fields the provider could not confidently identify. */
  warnings: string[];
}

export interface ExtractionInput {
  referralText: string;
  /** A structured reason-for-referral field carried over from the Referral Service, used as a hint only. */
  reasonForReferralHint?: string;
}

/**
 * Pluggable extraction backend — module #10's requirement that this be "an
 * AI-assisted structured extraction feature implemented as a pluggable
 * ExtractionProvider interface". Every implementation must be pure with
 * respect to persistence: it reads text in, returns structured data out,
 * and never itself writes to the database, calls the Audit Log Service, or
 * triggers any downstream action — CasesService owns all of that, and only
 * after a specialist has explicitly confirmed the output.
 *
 * See rule-based-extraction.provider.ts for the default (real, working)
 * implementation, and llm-extraction.provider.ts for how a real LLM-backed
 * provider plugs into this same interface.
 */
export interface ExtractionProvider {
  /** Stable identifier persisted on every ExtractionResult row, e.g. "rule-based-v1". */
  readonly name: string;
  extract(input: ExtractionInput): Promise<ExtractionOutput>;
}

export const EXTRACTION_PROVIDER = Symbol('EXTRACTION_PROVIDER');
