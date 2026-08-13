'use client';

import * as React from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField } from '@referralplatform/ui-components';
import { RequireAuth } from '../components/RequireAuth';
import { useAuth } from '../lib/auth/AuthContext';
import { findMyProfileByHpiI, registerSelfProfile, type RegisterProfileInput } from '../lib/api/directoryApi';
import type { AustralianState } from '@referralplatform/shared-types';

const AU_STATES: AustralianState[] = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const CONSULTING_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 'var(--rp-touch-target-min)',
  padding: '0 8px',
  border: '1px solid var(--rp-color-border)',
  borderRadius: 'var(--rp-radius-md)',
  fontFamily: 'var(--rp-font-family)',
  fontSize: 'var(--rp-font-size-body)',
};

/**
 * Directory profile management — claude/ui-design.md's Specialist portal
 * screen #5: "self-maintained listing (location, days, subspecialty) that
 * supersedes NHSD sync data." `PUT /directory/entries/self` always sets
 * `source: 'self_registered'` / `selfRegisteredOverride: true` server-side
 * — see BUILD_LOG/directory.md.
 */
export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  );
}

function ProfileContent() {
  const { accessToken } = useAuth();
  const [hpiI, setHpiI] = React.useState('');
  const [loadedHpiI, setLoadedHpiI] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [subspecialty, setSubspecialty] = React.useState('');
  const [locationName, setLocationName] = React.useState('');
  const [suburb, setSuburb] = React.useState('');
  const [state, setState] = React.useState<AustralianState>('NSW');
  const [postcode, setPostcode] = React.useState('');
  const [consultingDays, setConsultingDays] = React.useState<string[]>([]);
  const [econsultOptIn, setEconsultOptIn] = React.useState(false);
  const [acceptsBookingsViaPlatform, setAcceptsBookingsViaPlatform] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const loadExisting = async () => {
    if (!/^\d{16}$/.test(hpiI)) {
      setError('HPI-I must be 16 digits to look up an existing profile.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const existing = await findMyProfileByHpiI(hpiI);
      if (existing) {
        setDisplayName(existing.displayName);
        setSubspecialty(existing.subspecialty);
        setConsultingDays(existing.consultingDays);
        setEconsultOptIn(existing.econsultOptIn);
        setAcceptsBookingsViaPlatform(existing.acceptsBookingsViaPlatform);
        const loc = existing.practiceLocations[0];
        if (loc) {
          setLocationName(loc.name);
          setSuburb(loc.suburb);
          setState(loc.state as AustralianState);
          setPostcode(loc.postcode);
        }
        setLoadedHpiI(hpiI);
      } else {
        setLoadedHpiI(hpiI);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to look up your profile.');
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day: string) => {
    setConsultingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const input: RegisterProfileInput = {
        hpiI,
        displayName,
        subspecialty,
        practiceLocations: [{ name: locationName, suburb, state, postcode }],
        consultingDays,
        econsultOptIn,
        acceptsBookingsViaPlatform,
      };
      await registerSelfProfile(accessToken, input);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
      <Card>
        <CardHeader>
          <CardTitle>Directory profile</CardTitle>
        </CardHeader>
        <CardBody>
          <p style={{ color: 'var(--rp-color-text-muted)', marginBottom: 'var(--rp-space-3)' }}>
            Your self-registered listing always supersedes any National Health Services Directory (NHSD) sync data for
            the same HPI-I.
          </p>

          <FormField
            id="profile-hpii"
            label="HPI-I"
            hint="16-digit Healthcare Provider Identifier — Individual"
            required
          >
            <div style={{ display: 'flex', gap: 'var(--rp-space-2)' }}>
              <input
                id="profile-hpii"
                value={hpiI}
                onChange={(e) => setHpiI(e.target.value)}
                style={fieldStyle}
                maxLength={16}
              />
              <Button type="button" variant="secondary" disabled={loading || hpiI.length !== 16} onClick={loadExisting}>
                {loading ? 'Loading…' : 'Load existing'}
              </Button>
            </div>
          </FormField>

          {loadedHpiI && (
            <form onSubmit={submit}>
              <FormField id="profile-name" label="Display name" required>
                <input
                  id="profile-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={fieldStyle}
                />
              </FormField>
              <FormField id="profile-subspecialty" label="Subspecialty" required>
                <input
                  id="profile-subspecialty"
                  value={subspecialty}
                  onChange={(e) => setSubspecialty(e.target.value)}
                  style={fieldStyle}
                />
              </FormField>
              <FormField id="profile-location-name" label="Practice name" required>
                <input
                  id="profile-location-name"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  style={fieldStyle}
                />
              </FormField>
              <div style={{ display: 'flex', gap: 'var(--rp-space-2)' }}>
                <FormField id="profile-suburb" label="Suburb" required>
                  <input
                    id="profile-suburb"
                    value={suburb}
                    onChange={(e) => setSuburb(e.target.value)}
                    style={fieldStyle}
                  />
                </FormField>
                <FormField id="profile-state" label="State" required>
                  <select
                    id="profile-state"
                    value={state}
                    onChange={(e) => setState(e.target.value as AustralianState)}
                    style={fieldStyle}
                  >
                    {AU_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField id="profile-postcode" label="Postcode" required>
                  <input
                    id="profile-postcode"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    style={fieldStyle}
                    maxLength={4}
                  />
                </FormField>
              </div>

              <fieldset style={{ border: 'none', padding: 0, marginBottom: 'var(--rp-space-3)' }}>
                <legend style={{ fontWeight: 'var(--rp-font-weight-medium)', marginBottom: 'var(--rp-space-1)' }}>
                  Consulting days
                </legend>
                <div style={{ display: 'flex', gap: 'var(--rp-space-2)', flexWrap: 'wrap' }}>
                  {CONSULTING_DAYS.map((day) => (
                    <label key={day} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={consultingDays.includes(day)} onChange={() => toggleDay(day)} />
                      {day}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--rp-space-2)' }}>
                <input
                  type="checkbox"
                  checked={acceptsBookingsViaPlatform}
                  onChange={(e) => setAcceptsBookingsViaPlatform(e.target.checked)}
                />
                Accept bookings via ReferralPlatform
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--rp-space-3)' }}>
                <input type="checkbox" checked={econsultOptIn} onChange={(e) => setEconsultOptIn(e.target.checked)} />
                Opt in to eConsult / async-advice referrals
              </label>

              {error && <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p>}
              {saved && <p style={{ color: 'var(--rp-color-success-500)' }}>Profile saved.</p>}

              <Button
                type="submit"
                variant="primary"
                disabled={saving || !displayName || !subspecialty || consultingDays.length === 0}
              >
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
