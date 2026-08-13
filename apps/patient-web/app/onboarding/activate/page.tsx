'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, CardTitle, FormField, StatusBadge } from '@referralplatform/ui-components';
import {
  resendOtp,
  selectBranch,
  verifyIdentity,
  verifyOtp,
  type CarerRelationship,
} from '../../../lib/api/onboarding';
import { ApiError } from '../../../lib/api/http';
import { useAuth } from '../../../lib/auth/AuthContext';
import { ErrorState } from '../../../components/ErrorState';

type Step = 'enter-token' | 'verify-identity' | 'branch' | 'otp' | 'done';

const RELATIONSHIPS: Array<{ value: CarerRelationship; label: string }> = [
  { value: 'parent_guardian', label: 'Parent or guardian' },
  { value: 'adult_child', label: 'Adult child' },
  { value: 'spouse_partner', label: 'Spouse or partner' },
  { value: 'professional_support_worker', label: 'Professional support worker' },
  { value: 'other', label: 'Other' },
];

function ActivateInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const auth = useAuth();

  const [token, setToken] = React.useState(searchParams.get('token') ?? '');
  const [step, setStep] = React.useState<Step>(searchParams.get('token') ? 'verify-identity' : 'enter-token');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Step: verify identity
  const [dateOfBirth, setDateOfBirth] = React.useState('');
  const [medicareNumber, setMedicareNumber] = React.useState('');

  // Step: branch (patient vs carer)
  const [role, setRole] = React.useState<'patient' | 'carer'>('patient');
  const [carerGivenName, setCarerGivenName] = React.useState('');
  const [carerFamilyName, setCarerFamilyName] = React.useState('');
  const [carerEmail, setCarerEmail] = React.useState('');
  const [carerRelationship, setCarerRelationship] = React.useState<CarerRelationship>('parent_guardian');
  const [sharesPatientMobileNumber, setSharesPatientMobileNumber] = React.useState(true);
  const [ownMobileNumber, setOwnMobileNumber] = React.useState('');

  // Step: OTP
  const [otpCode, setOtpCode] = React.useState('');
  const [activatedPatientId, setActivatedPatientId] = React.useState<string | null>(null);
  const [activatedRole, setActivatedRole] = React.useState<'patient' | 'carer' | null>(null);

  async function onSubmitToken(e: React.FormEvent) {
    e.preventDefault();
    setStep('verify-identity');
  }

  async function onSubmitIdentity(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyIdentity(token, { dateOfBirth, medicareNumber: medicareNumber || undefined });
      setStep('branch');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify your details — check them and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitBranch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await selectBranch(token, {
        role,
        carer:
          role === 'carer'
            ? {
                givenName: carerGivenName,
                familyName: carerFamilyName,
                email: carerEmail,
                relationship: carerRelationship,
                sharesPatientMobileNumber,
                ownMobileNumber: sharesPatientMobileNumber ? undefined : ownMobileNumber,
              }
            : undefined,
      });
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await verifyOtp(token, otpCode);
      setActivatedPatientId(result.patientId);
      setActivatedRole(result.role);
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Incorrect code — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setError(null);
    setBusy(true);
    try {
      await resendOtp(token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend the code — try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  function onContinueToApp() {
    if (activatedPatientId && activatedRole) {
      auth.startLocalActivationSession(activatedPatientId, activatedRole);
    }
    router.push('/');
  }

  return (
    <Card style={{ maxWidth: 560, margin: '32px auto' }}>
      <CardHeader>
        <CardTitle>Set up your ReferralPlatform account</CardTitle>
      </CardHeader>
      <CardBody>
        {error && (
          <div style={{ marginBottom: 'var(--rp-space-3)' }}>
            <ErrorState message={error} />
          </div>
        )}

        {step === 'enter-token' && (
          <form onSubmit={onSubmitToken}>
            <p>Paste the activation link (or just the code at the end of it) your GP&apos;s text message sent you.</p>
            <FormField id="token" label="Activation link or code" required>
              <input
                value={token}
                onChange={(e) =>
                  setToken(e.target.value.includes('token=') ? e.target.value.split('token=')[1] : e.target.value)
                }
                required
              />
            </FormField>
            <Button type="submit" variant="primary">
              Continue
            </Button>
          </form>
        )}

        {step === 'verify-identity' && (
          <form onSubmit={onSubmitIdentity}>
            <p>First, confirm a couple of details your GP already has on file, so we know it&apos;s really you.</p>
            <FormField id="dob" label="Date of birth" required>
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
            </FormField>
            <FormField id="medicare" label="Medicare number (if your GP recorded one)" hint="10 digits, optional">
              <input value={medicareNumber} onChange={(e) => setMedicareNumber(e.target.value)} maxLength={10} />
            </FormField>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
            </Button>
          </form>
        )}

        {step === 'branch' && (
          <form onSubmit={onSubmitBranch}>
            <p>Is this account for you, or are you helping set it up for someone else?</p>
            <div style={{ display: 'flex', gap: 'var(--rp-space-3)', marginBottom: 'var(--rp-space-3)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--rp-space-1)' }}>
                <input type="radio" name="role" checked={role === 'patient'} onChange={() => setRole('patient')} />
                This is for me
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--rp-space-1)' }}>
                <input type="radio" name="role" checked={role === 'carer'} onChange={() => setRole('carer')} />
                I&apos;m helping someone else (a carer)
              </label>
            </div>

            {role === 'carer' && (
              <>
                <p style={{ fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
                  Tell us a bit about yourself — this keeps your access separate from the patient&apos;s, and lets us
                  verify you independently.
                </p>
                <FormField id="carerGivenName" label="Your first name" required>
                  <input value={carerGivenName} onChange={(e) => setCarerGivenName(e.target.value)} required />
                </FormField>
                <FormField id="carerFamilyName" label="Your last name" required>
                  <input value={carerFamilyName} onChange={(e) => setCarerFamilyName(e.target.value)} required />
                </FormField>
                <FormField id="carerEmail" label="Your email address" required>
                  <input type="email" value={carerEmail} onChange={(e) => setCarerEmail(e.target.value)} required />
                </FormField>
                <FormField id="carerRelationship" label="Your relationship to the patient" required>
                  <select
                    value={carerRelationship}
                    onChange={(e) => setCarerRelationship(e.target.value as CarerRelationship)}
                  >
                    {RELATIONSHIPS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div style={{ marginBottom: 'var(--rp-space-3)' }}>
                  <p style={{ marginBottom: 'var(--rp-space-1)' }}>
                    Is the mobile number this text message was sent to your own number, or the patient&apos;s?
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--rp-space-1)' }}>
                    <input
                      type="radio"
                      name="shares"
                      checked={sharesPatientMobileNumber}
                      onChange={() => setSharesPatientMobileNumber(true)}
                    />
                    It&apos;s the patient&apos;s number — I don&apos;t have my own mobile on file
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--rp-space-1)' }}>
                    <input
                      type="radio"
                      name="shares"
                      checked={!sharesPatientMobileNumber}
                      onChange={() => setSharesPatientMobileNumber(false)}
                    />
                    I have my own separate mobile number
                  </label>
                </div>
                {!sharesPatientMobileNumber && (
                  <FormField id="ownMobile" label="Your mobile number" required hint="e.g. 04xx xxx xxx">
                    <input value={ownMobileNumber} onChange={(e) => setOwnMobileNumber(e.target.value)} required />
                  </FormField>
                )}
                <p style={{ fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
                  You&apos;ll start with everyday-access permissions (a &quot;nominated delegate&quot;). Some sensitive
                  categories (mental health, sexual health, reproductive health, drug &amp; alcohol) stay hidden from
                  you unless the patient specifically shares them, and if you need full authority to act on the
                  patient&apos;s behalf you can upload evidence (e.g. power of attorney) later from the Consent &amp;
                  security page.
                </p>
              </>
            )}

            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Sending code…' : 'Send me a verification code'}
            </Button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={onSubmitOtp}>
            <p>We&apos;ve emailed you a 6-digit verification code. Enter it below to activate the account.</p>
            <FormField id="otp" label="Verification code" required hint="6 digits">
              <input
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                required
              />
            </FormField>
            <div style={{ display: 'flex', gap: 'var(--rp-space-2)' }}>
              <Button type="submit" variant="primary" disabled={busy || otpCode.length !== 6}>
                {busy ? 'Verifying…' : 'Activate my account'}
              </Button>
              <Button type="button" variant="ghost" onClick={onResend} disabled={busy}>
                Resend code
              </Button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div>
            <StatusBadge tone="success" label="Account activated" />
            <p style={{ marginTop: 'var(--rp-space-3)' }}>
              Your account is ready. Any referral your GP already sent is being routed to the specialist now. Next, we
              recommend setting up a passkey (a fast, secure way to sign in using your device&apos;s fingerprint, face,
              or screen lock) from the Consent &amp; security page — or you can keep using a password and a one-time
              code for now.
            </p>
            <Button variant="primary" onClick={onContinueToApp} style={{ marginTop: 'var(--rp-space-3)' }}>
              Continue to my account
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function ActivatePage() {
  return (
    <React.Suspense fallback={null}>
      <ActivateInner />
    </React.Suspense>
  );
}
