import { Injectable } from '@nestjs/common';
import type { NhsdDirectoryClient, NhsdProviderRecord } from './nhsd-client.interface';

/**
 * MOCK — replace with real integration.
 *
 * The real National Health Services Directory (NHSD) is operated by
 * Healthdirect Australia and exposes provider/organisation data via a FHIR
 * API that requires a production-access agreement and API credentials this
 * build does not have. This mock stands in for that API, returning a
 * realistic, fixed sample of Australian specialists spanning common
 * referral subspecialties and states, in exactly the shape
 * `NhsdDirectoryClient.fetchProviders()` would return from the real
 * service.
 *
 * Swap this for a real HTTP client (calling the real NHSD FHIR endpoints,
 * likely via services/fhir-gateway per solution-architecture-tech-stack.md's
 * "Integration & FHIR Gateway" service, since NHSD is itself a FHIR-based
 * directory) once credentials exist — `NhsdDirectorySyncService`'s call site
 * doesn't need to change shape, only the `NHSD_DIRECTORY_CLIENT` provider
 * binding in `directory.module.ts`.
 */
@Injectable()
export class MockNhsdDirectoryClient implements NhsdDirectoryClient {
  async fetchProviders(): Promise<NhsdProviderRecord[]> {
    // Simulates real network latency so callers/tests exercise the async path honestly.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return SAMPLE_NHSD_PROVIDERS;
  }
}

const SAMPLE_NHSD_PROVIDERS: NhsdProviderRecord[] = [
  {
    hpiI: '8003618765432101',
    displayName: 'Dr Amara Okafor',
    subspecialty: 'Cardiology',
    practiceLocations: [{ name: 'Sydney Heart Clinic', suburb: 'Darlinghurst', state: 'NSW', postcode: '2010' }],
    consultingDays: ['Mon', 'Wed', 'Fri'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
  },
  {
    hpiI: '8003618765432102',
    displayName: 'Dr Lucas Nguyen',
    subspecialty: 'Dermatology',
    practiceLocations: [{ name: 'Melbourne Skin & Mole Clinic', suburb: 'Fitzroy', state: 'VIC', postcode: '3065' }],
    consultingDays: ['Tue', 'Thu'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
  },
  {
    hpiI: '8003618765432103',
    displayName: 'Dr Priya Ramaswamy',
    subspecialty: 'Endocrinology',
    practiceLocations: [
      { name: 'Brisbane Diabetes & Endocrine Centre', suburb: 'Spring Hill', state: 'QLD', postcode: '4000' },
    ],
    consultingDays: ['Mon', 'Tue', 'Thu'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
  },
  {
    hpiI: '8003618765432104',
    displayName: 'Dr Callum Fitzgerald',
    subspecialty: 'ENT (Otolaryngology)',
    practiceLocations: [{ name: 'Perth Ear Nose & Throat', suburb: 'Subiaco', state: 'WA', postcode: '6008' }],
    consultingDays: ['Wed', 'Fri'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
  },
  {
    hpiI: '8003618765432105',
    displayName: 'Dr Grace Tan',
    subspecialty: 'Gastroenterology',
    practiceLocations: [{ name: 'Adelaide Digestive Health', suburb: 'North Adelaide', state: 'SA', postcode: '5006' }],
    consultingDays: ['Mon', 'Wed'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
  },
  {
    hpiI: '8003618765432106',
    displayName: 'Dr Ben Whitfield',
    subspecialty: 'Neurology',
    practiceLocations: [{ name: 'Hobart Neurology Centre', suburb: 'Sandy Bay', state: 'TAS', postcode: '7005' }],
    consultingDays: ['Tue', 'Thu'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
  },
  {
    hpiI: '8003618765432107',
    displayName: 'Dr Isabella Costa',
    subspecialty: 'Orthopaedic Surgery',
    practiceLocations: [
      { name: 'Canberra Orthopaedics & Sports Medicine', suburb: 'Deakin', state: 'ACT', postcode: '2600' },
    ],
    consultingDays: ['Mon', 'Thu', 'Fri'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
  },
  {
    hpiI: '8003618765432108',
    displayName: 'Dr Michael O’Brien',
    subspecialty: 'Psychiatry',
    practiceLocations: [{ name: 'Darwin Mental Health Practice', suburb: 'Darwin', state: 'NT', postcode: '0800' }],
    consultingDays: ['Mon', 'Tue', 'Wed'],
    econsultOptIn: true,
    acceptsBookingsViaPlatform: false,
  },
  {
    hpiI: '8003618765432109',
    displayName: 'Dr Sarah Jamieson',
    subspecialty: 'Rheumatology',
    practiceLocations: [
      { name: 'Sydney Arthritis & Rheumatology Clinic', suburb: 'St Leonards', state: 'NSW', postcode: '2065' },
    ],
    consultingDays: ['Wed', 'Fri'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
  },
  {
    hpiI: '8003618765432110',
    displayName: 'Dr Ahmed Hassan',
    subspecialty: 'Respiratory & Sleep Medicine',
    practiceLocations: [
      { name: 'Melbourne Respiratory & Sleep Institute', suburb: 'Box Hill', state: 'VIC', postcode: '3128' },
    ],
    consultingDays: ['Mon', 'Wed', 'Fri'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
  },
  {
    hpiI: '8003618765432111',
    displayName: 'Dr Emily Zhang',
    subspecialty: 'General Surgery',
    practiceLocations: [{ name: 'Gold Coast General Surgery', suburb: 'Southport', state: 'QLD', postcode: '4215' }],
    consultingDays: ['Tue', 'Thu', 'Fri'],
    econsultOptIn: false,
    acceptsBookingsViaPlatform: false,
  },
  {
    hpiI: '8003618765432112',
    displayName: 'Dr Rohan Kapoor',
    subspecialty: 'Paediatrics',
    practiceLocations: [
      { name: 'Sydney Children’s Health Practice', suburb: 'Randwick', state: 'NSW', postcode: '2031' },
    ],
    consultingDays: ['Mon', 'Tue', 'Thu', 'Fri'],
    econsultOptIn: true,
    acceptsBookingsViaPlatform: false,
  },
];
