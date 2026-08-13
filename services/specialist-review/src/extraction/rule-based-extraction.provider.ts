import { Injectable } from '@nestjs/common';
import type {
  ExtractedPatientInfo,
  ExtractedReferringGp,
  ExtractionInput,
  ExtractionOutput,
  ExtractionProvider,
} from './extraction-provider.interface';

/**
 * Default ExtractionProvider — a real, working, deterministic rule-based/
 * regex extractor. No network calls, no external credentials, so this is
 * always available regardless of what `EXTRACTION_PROVIDER` is configured
 * to elsewhere (see extraction.module.ts) and is what a real LLM-based
 * provider should be benchmarked against, not just replaced by.
 *
 * Every field-extraction method here is independent and best-effort: a
 * referral letter's layout varies a lot between GP practice software
 * (Best Practice, MedicalDirector, free text), so this looks for common
 * section-heading conventions (`Reason:`, `History:`, `Medications:`,
 * `Referring GP:` etc., case-insensitively, with or without a colon) and
 * falls back to a warning when nothing matches, rather than guessing.
 */
@Injectable()
export class RuleBasedExtractionProvider implements ExtractionProvider {
  readonly name = 'rule-based-v1';

  async extract(input: ExtractionInput): Promise<ExtractionOutput> {
    const text = input.referralText ?? '';
    const warnings: string[] = [];

    const patient = this.extractPatient(text, warnings);
    const reasonForReferral = this.extractReason(text, input.reasonForReferralHint, warnings);
    const keyHistory = this.extractSection(text, ['history', 'pmhx', 'past medical history', 'background']);
    const medications = this.extractMedications(text, warnings);
    const referringGp = this.extractReferringGp(text, warnings);
    const urgencyIndicators = this.extractUrgencyIndicators(text);

    if (keyHistory.length === 0) warnings.push('Could not confidently identify a history/background section.');
    if (medications.length === 0) warnings.push('No medications section found — confirm none were omitted.');

    const fieldsChecked = 6; // patient, reason, history, medications, referringGp, urgency (each contributes to confidence)
    let fieldsFound = 0;
    if (patient.name) fieldsFound += 1;
    if (reasonForReferral) fieldsFound += 1;
    if (keyHistory.length > 0) fieldsFound += 1;
    if (medications.length > 0) fieldsFound += 1;
    if (referringGp.name) fieldsFound += 1;
    fieldsFound += 1; // urgency scan always "succeeds" (an empty result is a valid result)

    return {
      patient,
      reasonForReferral,
      keyHistory,
      medications,
      referringGp,
      urgencyIndicators,
      confidence: Math.round((fieldsFound / fieldsChecked) * 100) / 100,
      warnings,
    };
  }

  private extractPatient(text: string, warnings: string[]): ExtractedPatientInfo {
    const name =
      this.matchLabel(text, ['patient name', 'patient', 're']) ?? this.matchLabel(text, ['name']) ?? undefined;
    if (!name) warnings.push('Could not confidently identify the patient name.');

    const dobMatch = text.match(/\b(?:d\.?o\.?b\.?|date of birth)\s*[:-]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\b/i);
    const dateOfBirth = dobMatch ? this.normaliseDate(dobMatch[1]) : undefined;
    if (!dateOfBirth) warnings.push('Could not confidently identify the patient date of birth.');

    const sexMatch = text.match(/\b(?:sex|gender)\s*[:-]?\s*(male|female|m|f|other|intersex)\b/i);
    const sex = sexMatch ? sexMatch[1].toUpperCase() : undefined;

    const medicareMatch = text.match(/\bmedicare\s*(?:no\.?|number)?\s*[:-]?\s*(\d{4}\s?\d{5}\s?\d)\b/i);
    const otherIdentifiers = medicareMatch ? [`Medicare: ${medicareMatch[1].replace(/\s+/g, ' ').trim()}`] : [];

    return { name, dateOfBirth, sex, otherIdentifiers };
  }

  private extractReason(text: string, hint: string | undefined, warnings: string[]): string | undefined {
    const fromSection = this.matchLabel(text, ['reason for referral', 'reason', 'presenting complaint']);
    if (fromSection) return fromSection;
    if (hint) return hint;
    warnings.push(
      'No "Reason for referral" section found in the letter text — falling back to the referral summary field, if any.',
    );
    return undefined;
  }

  private extractMedications(text: string, warnings: string[]): string[] {
    let items = this.extractSection(text, ['medications', 'current medications', 'meds', 'medication list']);
    // A comma-separated single line under the heading (no bullets, one line) comes back as one
    // "section" item — split it further rather than treating it as a single medication name.
    if (items.length === 1 && /[,;]/.test(items[0])) {
      items = items[0]
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (items.length === 0) {
      // Fallback: a single-line "Medications: X, Y, Z" (no bullets, no newline section).
      const inline = this.matchLabel(text, ['medications', 'current medications', 'meds']);
      if (inline) {
        return inline
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      warnings.push('No medications list could be parsed — verify against the original letter.');
    }
    return items;
  }

  private extractReferringGp(text: string, warnings: string[]): ExtractedReferringGp {
    const name =
      this.matchLabel(text, ['referring gp', 'referring doctor', 'gp']) ??
      (text.match(/\bDr\.?\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?)/)?.[0] || undefined);
    const practice = this.matchLabel(text, ['practice', 'clinic']);
    const providerNumberMatch = text.match(/\bprovider\s*(?:no\.?|number)?\s*[:-]?\s*([A-Za-z0-9]{6,8})\b/i);
    const providerNumber = providerNumberMatch ? providerNumberMatch[1] : undefined;
    const contactMatch = text.match(/\b(?:ph|phone|tel|contact)\s*[:-]?\s*(\(?0\d\)?[\d\s-]{6,})\b/i);
    const contact = contactMatch ? contactMatch[1].trim() : undefined;

    if (!name) warnings.push('Could not confidently identify the referring GP.');

    return { name, practice, providerNumber, contact };
  }

  private extractUrgencyIndicators(text: string): string[] {
    const keywords = [
      'urgent',
      'asap',
      'same day',
      'same-day',
      'emergency',
      'chest pain',
      'shortness of breath',
      'sudden onset',
      'severe',
      'rapidly worsening',
      'suicidal',
      'self-harm',
      'red flag',
    ];
    const lower = text.toLowerCase();
    return keywords.filter((k) => lower.includes(k));
  }

  /** Extracts a bulleted/newline-delimited section following one of `labels` as a heading, until the next blank line or heading. */
  private extractSection(text: string, labels: string[]): string[] {
    const labelPattern = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const headingRe = new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*:?\\s*\\n?`, 'i');
    const match = headingRe.exec(text);
    if (!match) return [];

    const start = match.index + match[0].length;
    const rest = text.slice(start);
    // Stop at the next blank line or the next "Word:" style heading line.
    const stopRe = /\n\s*\n|\n\s*[A-Za-z][A-Za-z /]{2,40}:\s*\n/;
    const stopMatch = stopRe.exec(rest);
    const sectionText = stopMatch ? rest.slice(0, stopMatch.index) : rest.split('\n\n')[0];

    return sectionText
      .split('\n')
      .map((line) => line.replace(/^[\s*•\d.)-]+/, '').trim())
      .filter((line) => line.length > 0);
  }

  /** Matches a "Label: value" line for any of `labels`, returning the trimmed value up to end of line. */
  private matchLabel(text: string, labels: string[]): string | undefined {
    const labelPattern = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*:\\s*(.+)`, 'i');
    const match = re.exec(text);
    return match ? match[1].trim() : undefined;
  }

  private normaliseDate(raw: string): string {
    return raw.replace(/[.]/g, '/');
  }
}
