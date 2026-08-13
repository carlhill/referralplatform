import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  HiServiceClient,
  ResolveHpiiInput,
  ResolveHpiiResult,
  ResolveIhiInput,
  ResolveIhiResult,
  VerifyHpioInput,
  VerifyHpioResult,
} from './hi-service.interface';

// Real-world Australian Healthcare Identifier issuer prefixes (public
// knowledge — the HI Service's numbering scheme). Used here only to make the
// mock's output *look* like a real identifier; these numbers are not
// registered against any real HI Service record.
const IHI_PREFIX = '800360';
const HPIO_PREFIX = '800362';
const HPII_PREFIX = '800361';

/**
 * MOCK — replace with real integration.
 *
 * Stands in for the real Healthcare Identifiers Service (a NASH-PKI-
 * authenticated SOAP/REST API operated by Services Australia). This mock is
 * *deterministic* — the same input always resolves to the same identifier —
 * which is what makes it usable for real EMPI/deduplication logic during
 * local dev and tests: two account-activation requests for the same
 * genuine patient (same name/DOB/Medicare number) resolve to the same
 * mock IHI, so the dedup check in onboarding.service.ts has something real
 * to compare against, not just a random UUID every time.
 *
 * Real integration requires: a NASH PKI certificate for this
 * organisation, registration with Services Australia's HI Service, and
 * (per the FHIR Gateway's role — see claude/modules-and-requirements.md,
 * "Integration & FHIR Gateway") almost certainly should be reached via
 * services/fhir-gateway rather than a direct SOAP client in this service,
 * once that integration exists.
 */
@Injectable()
export class MockHiServiceClient extends HiServiceClient {
  private readonly logger = new Logger(MockHiServiceClient.name);

  async resolveIhi(input: ResolveIhiInput): Promise<ResolveIhiResult> {
    const dob = new Date(input.dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      return { ihi: null, matchConfidence: 'none' };
    }

    const normalized = [
      input.givenName.trim().toLowerCase(),
      input.familyName.trim().toLowerCase(),
      input.dateOfBirth,
      (input.medicareNumber ?? '').replace(/\s+/g, ''),
    ].join('|');

    const ihi = deterministicNationalIdentifier(IHI_PREFIX, normalized);
    const matchConfidence = isPlausibleMedicareNumber(input.medicareNumber) ? 'exact' : 'probable';

    this.logger.debug(`[MOCK HI Service] resolveIhi -> ${ihi} (${matchConfidence})`);
    return { ihi, matchConfidence };
  }

  async verifyHpio(input: VerifyHpioInput): Promise<VerifyHpioResult> {
    if (!input.practiceName.trim()) {
      return { verified: false, reason: 'Practice name is required' };
    }
    if (!isValidNationalIdentifierFormat(input.hpiO, HPIO_PREFIX)) {
      return {
        verified: false,
        reason: `HPI-O must be a 16-digit identifier beginning with ${HPIO_PREFIX} with a valid check digit`,
      };
    }
    this.logger.debug(`[MOCK HI Service] verifyHpio ${input.hpiO} -> verified`);
    return { verified: true };
  }

  async resolveHpii(input: ResolveHpiiInput): Promise<ResolveHpiiResult> {
    if (!isValidAhpraFormat(input.ahpraNumber)) {
      return { hpiI: null, resolved: false, reason: 'AHPRA number is not in a recognised format (e.g. MED0001234567)' };
    }
    const normalized = `${input.ahpraNumber.trim().toUpperCase()}|${input.familyName.trim().toLowerCase()}`;
    const hpiI = deterministicNationalIdentifier(HPII_PREFIX, normalized);
    this.logger.debug(`[MOCK HI Service] resolveHpii ${input.ahpraNumber} -> ${hpiI}`);
    return { hpiI, resolved: true };
  }
}

/** AHPRA registration number: 3-letter profession code + 10 digits, e.g. MED0001234567. */
export function isValidAhpraFormat(ahpraNumber: string): boolean {
  return /^[A-Z]{3}\d{10}$/.test(ahpraNumber.trim().toUpperCase());
}

/** 16-digit national identifier with the given 6-digit issuer prefix and a mod-10 check digit. */
export function isValidNationalIdentifierFormat(identifier: string, prefix: string): boolean {
  if (!new RegExp(`^${prefix}\\d{10}$`).test(identifier)) {
    return false;
  }
  return checkDigit(identifier.slice(0, 15)) === identifier.at(-1);
}

/** Simple deterministic mod-10 check digit — NOT the real HI Service's actual (undisclosed) algorithm, just enough to make this mock internally self-consistent and testable. */
function checkDigit(fifteenDigits: string): string {
  const sum = fifteenDigits.split('').reduce((total, digit) => total + Number(digit), 0);
  return String(sum % 10);
}

/** Deterministically derives a 16-digit identifier (prefix + 9 hash-derived digits + check digit) from arbitrary input. */
function deterministicNationalIdentifier(prefix: string, input: string): string {
  const hash = createHash('sha256').update(input).digest('hex');
  // Take enough hex characters to safely exceed 9 decimal digits, then trim.
  const asDecimal = BigInt(`0x${hash.slice(0, 12)}`)
    .toString()
    .padStart(15, '0')
    .slice(0, 9);
  const body = `${prefix}${asDecimal}`; // 15 digits
  return `${body}${checkDigit(body)}`;
}

function isPlausibleMedicareNumber(medicareNumber?: string): boolean {
  if (!medicareNumber) return false;
  const digits = medicareNumber.replace(/\s+/g, '');
  return /^\d{10}$/.test(digits);
}
