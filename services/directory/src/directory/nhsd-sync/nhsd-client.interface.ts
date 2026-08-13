/**
 * The subset of the National Health Services Directory's provider data this
 * service consumes for its scheduled sync — see
 * `claude/specialist-directory-booking.md` (summarised into
 * modules-and-requirements.md's Directory Service requirements) and
 * BUILD_LOG/directory.md for the full mapping.
 */
export interface NhsdProviderRecord {
  /** Healthcare Provider Identifier — Individual, NHSD's own record key. */
  hpiI: string;
  displayName: string;
  subspecialty: string;
  practiceLocations: NhsdPracticeLocation[];
  consultingDays: string[];
  /** NHSD doesn't itself know about econsult; defaults false and is specialist-editable via self-registration. */
  econsultOptIn: boolean;
  acceptsBookingsViaPlatform: boolean;
}

export interface NhsdPracticeLocation {
  name: string;
  suburb: string;
  state: string;
  postcode: string;
}

/**
 * Clean interface over the real National Health Services Directory API —
 * see mock-nhsd-client.ts for what's mocked and why. `fetchProviders`
 * returns the full current provider dataset for this sync's scope (a real
 * client would likely support incremental/`since` fetches; not needed at
 * this build's mocked scale).
 */
export interface NhsdDirectoryClient {
  fetchProviders(): Promise<NhsdProviderRecord[]>;
}

export const NHSD_DIRECTORY_CLIENT = Symbol('NHSD_DIRECTORY_CLIENT');
