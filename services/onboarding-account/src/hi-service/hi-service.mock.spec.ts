import { MockHiServiceClient, isValidAhpraFormat, isValidNationalIdentifierFormat } from './hi-service.mock';

describe('MockHiServiceClient', () => {
  let client: MockHiServiceClient;

  beforeEach(() => {
    client = new MockHiServiceClient();
  });

  describe('resolveIhi', () => {
    it('is deterministic — same patient identity always resolves to the same IHI', async () => {
      const input = {
        givenName: 'Jane',
        familyName: 'Citizen',
        dateOfBirth: '1990-05-12',
        medicareNumber: '2953001234',
      };
      const first = await client.resolveIhi(input);
      const second = await client.resolveIhi({ ...input });
      expect(first.ihi).toBe(second.ihi);
      expect(first.ihi).toMatch(/^800360\d{10}$/);
    });

    it('resolves a different IHI for a different patient identity', async () => {
      const a = await client.resolveIhi({ givenName: 'Jane', familyName: 'Citizen', dateOfBirth: '1990-05-12' });
      const b = await client.resolveIhi({ givenName: 'John', familyName: 'Citizen', dateOfBirth: '1990-05-12' });
      expect(a.ihi).not.toBe(b.ihi);
    });

    it('is case/whitespace-insensitive on name matching', async () => {
      const a = await client.resolveIhi({ givenName: 'Jane', familyName: 'Citizen', dateOfBirth: '1990-05-12' });
      const b = await client.resolveIhi({ givenName: '  jane ', familyName: 'CITIZEN', dateOfBirth: '1990-05-12' });
      expect(a.ihi).toBe(b.ihi);
    });

    it('reports exact match confidence when a plausible Medicare number is supplied', async () => {
      const result = await client.resolveIhi({
        givenName: 'Jane',
        familyName: 'Citizen',
        dateOfBirth: '1990-05-12',
        medicareNumber: '2953001234',
      });
      expect(result.matchConfidence).toBe('exact');
    });

    it('reports probable match confidence without a Medicare number', async () => {
      const result = await client.resolveIhi({ givenName: 'Jane', familyName: 'Citizen', dateOfBirth: '1990-05-12' });
      expect(result.matchConfidence).toBe('probable');
    });

    it('returns no match for an invalid date of birth', async () => {
      const result = await client.resolveIhi({ givenName: 'Jane', familyName: 'Citizen', dateOfBirth: 'not-a-date' });
      expect(result).toEqual({ ihi: null, matchConfidence: 'none' });
    });
  });

  describe('verifyHpio', () => {
    it('rejects an HPI-O with the wrong prefix or length', async () => {
      const result = await client.verifyHpio({ hpiO: '1234567890123456', practiceName: 'Riverside Medical' });
      expect(result.verified).toBe(false);
    });

    it('rejects a missing practice name', async () => {
      const result = await client.verifyHpio({ hpiO: '8003621234567890', practiceName: '' });
      expect(result.verified).toBe(false);
    });

    it('verifies a well-formed HPI-O with a valid check digit', async () => {
      // Construct a value that passes isValidNationalIdentifierFormat's check-digit rule.
      const body = '800362000000123'; // prefix + 9 digits = 15
      const sum = body.split('').reduce((t, d) => t + Number(d), 0);
      const hpiO = `${body}${sum % 10}`;
      expect(isValidNationalIdentifierFormat(hpiO, '800362')).toBe(true);

      const result = await client.verifyHpio({ hpiO, practiceName: 'Riverside Medical Centre' });
      expect(result.verified).toBe(true);
    });
  });

  describe('resolveHpii', () => {
    it('rejects a malformed AHPRA number', async () => {
      const result = await client.resolveHpii({ ahpraNumber: 'not-valid', givenName: 'A', familyName: 'Smith' });
      expect(result.resolved).toBe(false);
      expect(result.hpiI).toBeNull();
    });

    it('deterministically resolves a well-formed AHPRA number to an HPI-I', async () => {
      const input = { ahpraNumber: 'MED0001234567', givenName: 'Alex', familyName: 'Smith' };
      const first = await client.resolveHpii(input);
      const second = await client.resolveHpii({ ...input });
      expect(first.resolved).toBe(true);
      expect(first.hpiI).toBe(second.hpiI);
      expect(first.hpiI).toMatch(/^800361\d{10}$/);
    });
  });
});

describe('isValidAhpraFormat', () => {
  it('accepts the standard 3-letter + 10-digit AHPRA format', () => {
    expect(isValidAhpraFormat('MED0001234567')).toBe(true);
    expect(isValidAhpraFormat('med0001234567')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidAhpraFormat('MED123')).toBe(false);
    expect(isValidAhpraFormat('12340001234567')).toBe(false);
  });
});
