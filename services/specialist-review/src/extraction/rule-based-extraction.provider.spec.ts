import { RuleBasedExtractionProvider } from './rule-based-extraction.provider';

const SAMPLE_LETTER = `Re: John Smith
DOB: 04/11/1978
Sex: Male
Medicare No: 2951 24356 1

Reason for referral:
Please assess this patient for suspected sleep apnoea, worsening over the last 3 months.

History:
- Loud snoring reported by partner
- Daytime somnolence
- BMI 34
- No prior sleep studies

Medications:
Metformin 500mg BD, Atorvastatin 20mg nocte, Ramipril 5mg daily

Referring GP: Dr Sarah Chen
Practice: Riverside Family Medical
Provider No: 123456AB
Phone: 03 9555 1234
`;

describe('RuleBasedExtractionProvider', () => {
  let provider: RuleBasedExtractionProvider;

  beforeEach(() => {
    provider = new RuleBasedExtractionProvider();
  });

  it('reports its own name', () => {
    expect(provider.name).toBe('rule-based-v1');
  });

  it('extracts patient name and DOB from a well-formed referral letter', async () => {
    const result = await provider.extract({ referralText: SAMPLE_LETTER });
    expect(result.patient.name).toBe('John Smith');
    expect(result.patient.dateOfBirth).toBe('04/11/1978');
    expect(result.patient.sex).toBe('MALE');
    expect(result.patient.otherIdentifiers).toEqual(['Medicare: 2951 24356 1']);
  });

  it('extracts the reason for referral', async () => {
    const result = await provider.extract({ referralText: SAMPLE_LETTER });
    expect(result.reasonForReferral).toContain('sleep apnoea');
  });

  it('extracts key history as a bullet list', async () => {
    const result = await provider.extract({ referralText: SAMPLE_LETTER });
    expect(result.keyHistory).toEqual([
      'Loud snoring reported by partner',
      'Daytime somnolence',
      'BMI 34',
      'No prior sleep studies',
    ]);
  });

  it('extracts medications as a list', async () => {
    const result = await provider.extract({ referralText: SAMPLE_LETTER });
    expect(result.medications).toEqual(['Metformin 500mg BD', 'Atorvastatin 20mg nocte', 'Ramipril 5mg daily']);
  });

  it('extracts the referring GP', async () => {
    const result = await provider.extract({ referralText: SAMPLE_LETTER });
    expect(result.referringGp.name).toBe('Dr Sarah Chen');
    expect(result.referringGp.practice).toBe('Riverside Family Medical');
    expect(result.referringGp.providerNumber).toBe('123456AB');
    expect(result.referringGp.contact).toContain('03 9555 1234');
  });

  it('reports a high confidence score when every field is found', async () => {
    const result = await provider.extract({ referralText: SAMPLE_LETTER });
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.warnings).toHaveLength(0);
  });

  it('surfaces urgency keywords literally present in the text without inferring anything', async () => {
    const urgent = await provider.extract({
      referralText: SAMPLE_LETTER.replace(
        'worsening over the last 3 months',
        'worsening, urgent review requested — chest pain on exertion',
      ),
    });
    expect(urgent.urgencyIndicators).toEqual(expect.arrayContaining(['urgent', 'chest pain']));
  });

  it('falls back to the structured hint when no "Reason for referral" section is present', async () => {
    const noReason = 'Re: Jane Doe\nDOB: 01/01/1990\n\nHistory:\n- Nil relevant\n';
    const result = await provider.extract({ referralText: noReason, reasonForReferralHint: 'Query thyroid nodule' });
    expect(result.reasonForReferral).toBe('Query thyroid nodule');
  });

  it('produces warnings and low confidence for sparse/unstructured text', async () => {
    const sparse = 'Please see this patient, thanks.';
    const result = await provider.extract({ referralText: sparse });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.keyHistory).toEqual([]);
    expect(result.medications).toEqual([]);
  });

  it('never throws on empty input', async () => {
    const result = await provider.extract({ referralText: '' });
    expect(result).toBeDefined();
    expect(result.confidence).toBeLessThan(0.5);
  });
});
