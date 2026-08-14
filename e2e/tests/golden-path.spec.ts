import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { urls, testUsers } from './support/env';
import { decodeJwtPayload, fetchToken, seedAppSession, type TokenSet } from './support/keycloak';

/**
 * Golden-path e2e test — GP creates a referral in the GP portal, it routes
 * through the Directory Service (HealthPathways specialist-type suggestion
 * + directory search) and the Booking Service, the specialist sees it in
 * the Specialist Portal, and the patient sees both the referral and a
 * booking outcome in Patient Web.
 *
 * See README.md before touching this file — in particular "Why ROPC and
 * not the real login UI", "Why a specialist self-registers first", and
 * "Known gap: nothing wires Booking -> Specialist Review's `POST /cases`".
 * Every HTTP call this test causes (whether via a UI click or a direct API
 * call) hits a real, unmodified backend endpoint — nothing here is
 * mocked/faked beyond what BUILD_LOG/*.md already documents each service
 * itself doing (e.g. directory's NHSD/HealthPathways integrations).
 */

const REFERRAL_REASON = 'Chest pain and palpitations for several weeks, worsening on exertion';
// See services/directory/src/directory/healthpathways/static-pathway-links.ts —
// "chest pain"/"palpitations" match the 'cardiology' category, which is the
// specific reason this referral's wording was chosen, not incidental.
const SUBSPECIALTY = 'Cardiology';

test.describe.configure({ mode: 'serial' });

let gpTokens: TokenSet;
let specialistTokens: TokenSet;
let patientTokens: TokenSet;
let gpSub: string;
let specialistSub: string;
let patientSub: string;

let gpContext: BrowserContext;
let specialistContext: BrowserContext;
let patientContext: BrowserContext;
let gpPage: Page;
let specialistPage: Page;
let patientPage: Page;

/** The id the referral/booking/specialist-portal all end up scoped by for
 * "this specialist" — see README.md's "Why a specialist self-registers
 * first" for why this is a directory-entry id, not the specialist's own
 * Keycloak `sub` (a real, currently-unwired gap in this build). */
let specialistScopeId: string;
let referralId: string;

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  [gpTokens, specialistTokens, patientTokens] = await Promise.all([
    fetchToken(request, testUsers.gp.username, testUsers.gp.password, testUsers.gp.clientId),
    fetchToken(request, testUsers.specialist.username, testUsers.specialist.password, testUsers.specialist.clientId),
    fetchToken(request, testUsers.patient.username, testUsers.patient.password, testUsers.patient.clientId),
  ]);
  gpSub = decodeJwtPayload(gpTokens.accessToken).sub as string;
  specialistSub = decodeJwtPayload(specialistTokens.accessToken).sub as string;
  patientSub = decodeJwtPayload(patientTokens.accessToken).sub as string;
  await request.dispose();
});

test.beforeAll(async ({ browser }) => {
  gpContext = await browser.newContext();
  specialistContext = await browser.newContext();
  patientContext = await browser.newContext();
  await seedAppSession(gpContext, 'rp_gp_portal_tokens', gpTokens);
  await seedAppSession(specialistContext, 'rp_specialist_portal_tokens', specialistTokens);
  await seedAppSession(patientContext, 'rp_patient_web_tokens', patientTokens);
  gpPage = await gpContext.newPage();
  specialistPage = await specialistContext.newPage();
  patientPage = await patientContext.newPage();
});

test.afterAll(async () => {
  await Promise.all([gpContext?.close(), specialistContext?.close(), patientContext?.close()]);
});

test('GP referral routes through directory + booking to the specialist and patient', async ({ playwright }) => {
  const api: APIRequestContext = await playwright.request.newContext();

  await test.step('Specialist self-registers a directory profile (real PUT /directory/entries/self)', async () => {
    const res = await api.put(`${urls.directory}/entries/self`, {
      headers: { Authorization: `Bearer ${specialistTokens.accessToken}` },
      data: {
        hpiI: '8003611111111111',
        displayName: 'Dr Test Specialist (e2e)',
        subspecialty: SUBSPECIALTY,
        practiceLocations: [
          { name: 'e2e Test Cardiology Clinic', suburb: 'Sydney', state: 'NSW', postcode: '2000' },
        ],
        consultingDays: ['Mon', 'Wed', 'Fri'],
        econsultOptIn: true,
        acceptsBookingsViaPlatform: true,
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const entry = await res.json();
    // See README.md: no code path in this build sets a directory entry's
    // `specialistId` from a real Keycloak principal yet, so this falls back
    // to the entry's own id — which is exactly what the GP portal's
    // HealthPathways-suggestion dropdown will also resolve to (see
    // apps/gp-portal/app/referrals/new/page.tsx: `entry.specialistId ?? entry.id`).
    specialistScopeId = entry.specialistId ?? entry.id;
    expect(specialistScopeId).toBeTruthy();
  });

  await test.step('GP practice system establishes an authorised GP-patient link (real POST /gp-links, urgent bypass)', async () => {
    // No GP-portal screen exists for this (root CONVENTIONS.md /
    // BUILD_LOG/gp-authorisation.md: the real caller is a GP-practice
    // system, not this portal) — calling the API directly here plays that
    // role, exactly as a practice management system would ahead of the GP
    // ever opening the referral screen.
    const res = await api.post(`${urls.gpAuthorisation}/gp-links`, {
      headers: { Authorization: `Bearer ${gpTokens.accessToken}` },
      data: {
        patientId: patientSub,
        gpId: gpSub,
        practiceHpiO: '8003629999999999',
        urgentEscalation: true,
        urgentJustification: 'e2e golden-path fixture — auto-approve so referral creation is not blocked on a manual patient-approval step.',
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const link = await res.json();
    expect(link.status).toBe('approved');
  });

  await test.step('GP creates a referral in the GP portal', async () => {
    await gpPage.goto(`${urls.gpPortal}/referrals/new`);
    await expect(gpPage.getByRole('heading', { name: 'Create a referral' })).toBeVisible();

    // These three FormFields are `required`, which appends " *" to the
    // rendered label text (see packages/ui-components/src/FormField.tsx) —
    // match by substring (Playwright's getByLabel default) rather than exact.
    await gpPage.getByLabel('Patient id').fill(patientSub);
    await gpPage.getByLabel('Your GP id').fill(gpSub);
    await gpPage.getByLabel('Reason for referral').fill(REFERRAL_REASON);
    // Real backend calls fire on a debounce (compliance preview + HealthPathways
    // suggestion) — wait for the suggestion card rather than a fixed sleep.
    await expect(gpPage.getByText('HealthPathways suggestion')).toBeVisible({ timeout: 10_000 });

    const specialistSelect = gpPage.getByLabel('Matching specialists in the directory');
    await expect(specialistSelect).toBeVisible();
    await specialistSelect.selectOption(specialistScopeId);

    await gpPage.getByLabel('Patient account already active', { exact: true }).check();
    await gpPage.getByRole('button', { name: 'Create referral' }).click();

    await expect(gpPage.getByText(/Referral created — status:/)).toBeVisible({ timeout: 15_000 });
    const referralLink = gpPage.getByRole('link', { name: 'View referral detail' });
    const href = await referralLink.getAttribute('href');
    referralId = href!.split('/').pop()!;
    expect(referralId).toBeTruthy();
  });

  await test.step('The referral is real and routed (GET /referrals/:id via the Referral Service)', async () => {
    const res = await api.get(`${urls.referral}/referrals/${referralId}`, {
      headers: { Authorization: `Bearer ${gpTokens.accessToken}` },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const referral = await res.json();
    expect(referral.patientId).toBe(patientSub);
    expect(referral.specialistId).toBe(specialistScopeId);
    expect(['routed', 'queued']).toContain(referral.status);
  });

  await test.step('The specialist sees the new referral in their Specialist Portal queue', async () => {
    await specialistPage.goto(`${urls.specialistPortal}/queue`);
    // Point this portal's "which SpecialistId am I" scope at the directory
    // entry id the referral was actually routed to — a real, built-in
    // override (see apps/specialist-portal/app/lib/auth/AuthContext.tsx's
    // doc comment: "lets this app be exercised against seeded/demo data
    // ... without waiting on that cross-service mapping to be built").
    const idButton = specialistPage.getByRole('button', { name: /Specialist id:/ });
    await idButton.click();
    const idInput = specialistPage.getByLabel('Specialist id');
    await idInput.fill(specialistScopeId);
    await specialistPage.getByRole('button', { name: 'Save' }).click();

    await specialistPage.getByRole('button', { name: /Refreshing…|Refresh/ }).click();
    await expect(specialistPage.getByText('New referrals')).toBeVisible();
    await expect(specialistPage.getByText(REFERRAL_REASON, { exact: false })).toBeVisible({ timeout: 15_000 });
  });

  await test.step('The patient sees the referral in Patient Web', async () => {
    await patientPage.goto(`${urls.patientWeb}/referrals`);
    await expect(patientPage.getByText('My referrals')).toBeVisible();
    await expect(patientPage.getByText(REFERRAL_REASON.slice(0, 80), { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await patientPage.getByText(REFERRAL_REASON.slice(0, 80), { exact: false }).click();
    await expect(patientPage).toHaveURL(new RegExp(`/referrals/${referralId}`));
  });

  await test.step('The patient captures a booking preference and sees a booking outcome (real POST /bookings)', async () => {
    await patientPage.goto(`${urls.patientWeb}/referrals/${referralId}/booking`);
    await expect(patientPage.getByRole('heading', { name: 'When works best for you?' })).toBeVisible({
      timeout: 15_000,
    });
    await patientPage.getByRole('button', { name: /Find matching appointments|Saving…/ }).click();

    // No Slot rows are seeded anywhere in this build for a brand-new
    // directory entry with no calendar connection, so the real, honest
    // outcome here is "waitlisted", not a confirmed time — see
    // BUILD_LOG/booking.md ("no claim-window ... auto-claims immediately"
    // and the mock calendar client's empty-by-default slots). Assert on
    // whichever real status comes back rather than assuming a slot exists.
    await expect(patientPage.getByText('Your booking')).toBeVisible({ timeout: 15_000 });
    const waitlisted = patientPage.getByText(/waitlist/i);
    const confirmed = patientPage.getByText(/^Confirmed for /);
    await expect(waitlisted.or(confirmed)).toBeVisible({ timeout: 15_000 });

    const res = await api.get(`${urls.booking}/bookings`, {
      headers: { Authorization: `Bearer ${patientTokens.accessToken}` },
      params: { referralId },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const bookings = await res.json();
    expect(bookings.length).toBeGreaterThan(0);
    expect(bookings[0].patientId).toBe(patientSub);
    expect(bookings[0].specialistId).toBe(specialistScopeId);
    expect(['preference_captured', 'waitlisted', 'confirmed']).toContain(bookings[0].status);
  });

  await api.dispose();
});
