import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  AhpraVerificationClient,
  VerifyAhpraRegistrationInput,
  VerifyAhpraRegistrationResult,
} from './ahpra.interface';

/** AHPRA's real 3-letter profession codes — a small, public, stable list. */
const PROFESSION_CODES: Record<string, string> = {
  MED: 'Medical Practitioner',
  NMW: 'Nursing and Midwifery',
  PSY: 'Psychology',
  DEN: 'Dental',
  PHA: 'Pharmacy',
  PHY: 'Physiotherapy',
  OPT: 'Optometry',
  CHM: 'Chiropractic',
};

const MOCK_SPECIALTIES = [
  'General Practice',
  'Cardiology',
  'Dermatology',
  'Endocrinology',
  'Gastroenterology',
  'Neurology',
  'Obstetrics and Gynaecology',
  'Oncology',
  'Ophthalmology',
  'Orthopaedic Surgery',
  'Paediatrics',
  'Psychiatry',
  'Respiratory Medicine',
  'Rheumatology',
  'Urology',
];

/**
 * MOCK — replace with real integration.
 *
 * Stands in for a live lookup against AHPRA's public register
 * (https://www.ahpra.gov.au/registration/registers-of-practitioners.aspx).
 * The real register is a free, individual, on-demand HTML/search lookup —
 * AHPRA does not currently publish a bulk API, so a real integration is
 * more likely to be a rate-limited scraper/lookup-on-demand than a
 * conventional REST client; out of scope to build against a live register
 * without violating AHPRA's terms of use, so this mock stands in with
 * deterministic, format-validated results.
 */
@Injectable()
export class MockAhpraVerificationClient extends AhpraVerificationClient {
  private readonly logger = new Logger(MockAhpraVerificationClient.name);

  async verifyRegistration(input: VerifyAhpraRegistrationInput): Promise<VerifyAhpraRegistrationResult> {
    const normalized = input.ahpraNumber.trim().toUpperCase();
    const match = /^([A-Z]{3})(\d{10})$/.exec(normalized);
    if (!match) {
      return { verified: false, reason: 'AHPRA number is not in a recognised format (e.g. MED0001234567)' };
    }
    const [, professionCode] = match;
    if (!(professionCode in PROFESSION_CODES)) {
      return { verified: false, reason: `Unrecognised AHPRA profession code '${professionCode}'` };
    }

    // Deterministic mock "registration status": every well-formed number for
    // a recognised profession is treated as currently registered, except a
    // deliberately reserved test fixture range (numeric body ending in
    // '0000000000') reserved to exercise the "not currently registered" path
    // in tests without relying on real practitioner data.
    const numericBody = match[2];
    if (numericBody === '0000000000') {
      return { verified: false, registrationStatus: 'Cancelled', reason: 'Registration is not current' };
    }

    const specialty = deterministicPick(MOCK_SPECIALTIES, `${normalized}|${input.familyName.toLowerCase()}`);
    this.logger.debug(`[MOCK AHPRA] ${normalized} -> Registered, ${specialty}`);
    return { verified: true, registrationStatus: 'Registered', specialty };
  }
}

function deterministicPick<T>(items: T[], seed: string): T {
  const hash = createHash('sha256').update(seed).digest();
  const index = hash.readUInt32BE(0) % items.length;
  return items[index];
}
