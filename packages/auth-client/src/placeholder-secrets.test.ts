import { assertNotPlaceholderSecret, isPlaceholderSecret } from './placeholder-secrets';

const PROD = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
const DEV = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;

describe('isPlaceholderSecret', () => {
  it('recognises the values actually committed to this repo', () => {
    // Every one of these is real: docker-compose.yml and realm-export.json ship them.
    expect(isPlaceholderSecret('change-me-in-local-env')).toBe(true);
    expect(isPlaceholderSecret('admin')).toBe(true);
    expect(isPlaceholderSecret('referralplatform')).toBe(true);
  });

  it('treats an absent or blank secret as at least as bad as a placeholder', () => {
    expect(isPlaceholderSecret(undefined)).toBe(true);
    expect(isPlaceholderSecret('')).toBe(true);
  });

  it('is not fooled by case or surrounding whitespace', () => {
    expect(isPlaceholderSecret('  Change-Me-In-Local-Env  ')).toBe(true);
  });

  it('accepts something that looks like a real secret', () => {
    expect(isPlaceholderSecret('kc_7f3a91b0c4e84d2f9a17')).toBe(false);
  });
});

describe('assertNotPlaceholderSecret', () => {
  it('refuses to start in production with a placeholder', () => {
    expect(() => assertNotPlaceholderSecret('KEYCLOAK_CLIENT_SECRET', 'change-me-in-local-env', PROD)).toThrow(
      /KEYCLOAK_CLIENT_SECRET/,
    );
  });

  it('names the offending variable so the failure is actionable', () => {
    expect(() => assertNotPlaceholderSecret('DATABASE_PASSWORD', 'admin', PROD)).toThrow(/DATABASE_PASSWORD/);
  });

  /**
   * The guard must be completely inert outside production — local dev, CI and every
   * test in this repo run on exactly these placeholders, so a guard that fired
   * everywhere would simply be disabled by the next person who hit it.
   */
  it('does nothing outside production, even with a placeholder', () => {
    expect(() => assertNotPlaceholderSecret('KEYCLOAK_CLIENT_SECRET', 'change-me-in-local-env', DEV)).not.toThrow();
  });

  it('allows a real secret in production', () => {
    expect(() => assertNotPlaceholderSecret('KEYCLOAK_CLIENT_SECRET', 'kc_7f3a91b0c4e84d2f9a17', PROD)).not.toThrow();
  });
});
