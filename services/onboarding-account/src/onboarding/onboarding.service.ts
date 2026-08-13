import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HPIO } from '@referralplatform/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditOutboxService } from '../audit-outbox/audit-outbox.service';
import { HiServiceClient } from '../hi-service/hi-service.interface';
import { EmailService } from '../notification/email.service';
import { IdentityAccessClient } from '../identity-access-client/identity-access.client';
import { generateActivationToken, hashActivationToken } from '../common/token/activation-token.util';
import { generateOtpCode, hashOtpCode, verifyOtpCode } from '../common/otp/otp.util';
import { CreateActivationRequestDto } from './dto/create-activation-request.dto';
import { VerifyIdentityDto } from './dto/verify-identity.dto';
import { SelectBranchDto } from './dto/select-branch.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
/** Compares only the calendar date, tolerant of `b` being a bare date or a full ISO date-time string. */
function isSameCalendarDate(a: Date, b: string): boolean {
  const parsedB = new Date(b);
  if (Number.isNaN(parsedB.getTime())) return false;
  return a.toISOString().slice(0, 10) === parsedB.toISOString().slice(0, 10);
}
function ageInYears(dateOfBirth: Date, asOf: Date): number {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const hasHadBirthdayThisYear =
    asOf.getMonth() > dateOfBirth.getMonth() ||
    (asOf.getMonth() === dateOfBirth.getMonth() && asOf.getDate() >= dateOfBirth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditOutbox: AuditOutboxService,
    private readonly hiService: HiServiceClient,
    private readonly email: EmailService,
    private readonly identityAccess: IdentityAccessClient,
  ) {}

  private cfg(key: string, fallback: number): number {
    return this.config.get<number>(key, fallback);
  }

  private otpSecret(): string {
    return this.config.getOrThrow<string>('OTP_HASH_SECRET');
  }

  // ---------------------------------------------------------------------
  // Step 1: GP triggers a new-account request
  // ---------------------------------------------------------------------

  async requestActivation(dto: CreateActivationRequestDto) {
    await this.assertVerifiedPractice(dto.triggeringGpHpiO);
    await this.assertNotRateLimited(dto.triggeringGpId, dto.patientMobileNumber);

    const { ihi, matchConfidence } = await this.hiService.resolveIhi({
      givenName: dto.patientGivenName,
      familyName: dto.patientFamilyName,
      dateOfBirth: dto.patientDateOfBirth,
      medicareNumber: dto.patientMedicareNumber,
    });
    if (!ihi) {
      throw new BadRequestException(
        'Could not resolve a Healthcare Identifier for this patient — check the date of birth.',
      );
    }

    const dob = new Date(`${dto.patientDateOfBirth}T00:00:00.000Z`);
    const now = new Date();

    let patient = await this.prisma.patient.findUnique({ where: { ihi } });

    if (patient) {
      if (patient.status === 'active') {
        throw new ConflictException(
          'This patient already has an active ReferralPlatform account. Use the GP Authorisation Service to ' +
            'request a link to the existing account rather than creating a new one.',
        );
      }
      if (patient.status === 'frozen_deceased' || patient.status === 'suspended') {
        throw new ConflictException(`This patient's account is currently ${patient.status.replace('_', ' ')}.`);
      }
      // status === 'pending_activation' — an in-flight or lapsed prior
      // request for the same (IHI-matched) patient. Reissue a fresh
      // activation request against the same patient record rather than
      // creating a duplicate patient — this is the legitimate "GP resends
      // after the 2-day queue lapsed" case.
    } else {
      patient = await this.prisma.patient.create({
        data: {
          ihi,
          givenName: dto.patientGivenName,
          familyName: dto.patientFamilyName,
          dateOfBirth: dob,
          mobileNumber: dto.patientMobileNumber,
          email: dto.patientEmail,
          medicareNumber: dto.patientMedicareNumber,
          isMinor: ageInYears(dob, now) < 18,
          status: 'pending_activation',
        },
      });
    }

    const token = generateActivationToken();
    const tokenHash = hashActivationToken(token);
    const linkExpiresAt = addHours(now, this.cfg('ACTIVATION_LINK_TTL_HOURS', 48));
    const queueExpiresAt = addHours(now, this.cfg('QUEUE_TTL_HOURS', 48));

    const activationRequest = await this.prisma.$transaction(async (tx) => {
      const request = await tx.accountActivationRequest.create({
        data: {
          patientId: patient!.id,
          triggeringGpId: dto.triggeringGpId,
          triggeringGpHpiO: dto.triggeringGpHpiO,
          tokenHash,
          dobSnapshot: dob,
          medicareSnapshot: dto.patientMedicareNumber,
          linkEmail: dto.patientEmail,
          linkExpiresAt,
          queueExpiresAt,
        },
      });
      await this.auditOutbox.enqueue(tx, {
        type: 'account.activation.requested',
        actor: {
          principalType: 'gp',
          id: dto.triggeringGpId,
          healthcareIdentifier: dto.triggeringGpHpiO as unknown as HPIO,
        },
        subject: { type: 'Patient', id: patient!.id },
        payload: {
          activationRequestId: request.id,
          matchConfidence,
          linkExpiresAt: linkExpiresAt.toISOString(),
          queueExpiresAt: queueExpiresAt.toISOString(),
        },
      });
      return request;
    });

    const activationUrl = `${this.config.get<string>('ACTIVATION_LINK_BASE_URL', 'http://localhost:3102/activate')}?token=${token}`;
    await this.email.sendActivationLinkEmail({
      to: dto.patientEmail,
      patientFirstName: dto.patientGivenName,
      activationUrl,
      expiresAt: linkExpiresAt,
    });

    return {
      activationRequestId: activationRequest.id,
      patientId: patient.id,
      linkExpiresAt: linkExpiresAt.toISOString(),
      queueExpiresAt: queueExpiresAt.toISOString(),
    };
  }

  private async assertVerifiedPractice(hpiO: string): Promise<void> {
    const practice = await this.prisma.gpPractice.findUnique({ where: { hpiO } });
    if (!practice || practice.verificationStatus !== 'verified' || !practice.complianceChecklistAcknowledgedAt) {
      throw new ForbiddenException(
        'The referring practice must be HPI-O-verified and have acknowledged the compliance checklist before ' +
          'it can trigger a new patient account — see POST /gp-practices and POST /gp-practices/:id/compliance-checklist/acknowledge.',
      );
    }
  }

  /** Per identity-security-recommendations.md §5: "rate-limit and monitor account-creation requests per GP, per mobile number." */
  private async assertNotRateLimited(triggeringGpId: string, mobileNumber: string): Promise<void> {
    const oneHourAgo = addHours(new Date(), -1);
    const oneDayAgo = addHours(new Date(), -24);

    const [byGp, byMobile] = await Promise.all([
      this.prisma.accountActivationRequest.count({
        where: { triggeringGpId, createdAt: { gte: oneHourAgo } },
      }),
      this.prisma.accountActivationRequest.count({
        where: { patient: { mobileNumber }, createdAt: { gte: oneDayAgo } },
      }),
    ]);

    if (byGp >= this.cfg('ACCOUNT_REQUEST_MAX_PER_GP_PER_HOUR', 20)) {
      throw new ForbiddenException(
        'Too many account-activation requests from this GP in the last hour — try again later.',
      );
    }
    if (byMobile >= this.cfg('ACCOUNT_REQUEST_MAX_PER_MOBILE_PER_DAY', 3)) {
      throw new ForbiddenException('Too many account-activation requests for this mobile number in the last 24 hours.');
    }
  }

  // ---------------------------------------------------------------------
  // Step 2: verify DOB/Medicare before asking who's who
  // ---------------------------------------------------------------------

  async verifyIdentity(token: string, dto: VerifyIdentityDto) {
    // Status stays 'pending' across failed attempts (only the attempt
    // counter/lockout change) — a request only ever leaves 'pending' on a
    // *successful* verification, so this is the only status allowed here.
    const request = await this.findActiveRequestByToken(token, ['pending']);

    if (request.identityLockedUntil && request.identityLockedUntil > new Date()) {
      throw new ForbiddenException(
        `Too many failed verification attempts. Try again after ${request.identityLockedUntil.toISOString()}.`,
      );
    }

    const dobMatches = isSameCalendarDate(request.dobSnapshot, dto.dateOfBirth);
    const medicareMatches = request.medicareSnapshot ? request.medicareSnapshot === dto.medicareNumber : true;

    if (!dobMatches || !medicareMatches) {
      const attempts = request.identityVerifyAttempts + 1;
      const maxAttempts = this.cfg('IDENTITY_VERIFY_MAX_ATTEMPTS', 5);
      const locked = attempts >= maxAttempts;
      await this.prisma.accountActivationRequest.update({
        where: { id: request.id },
        data: {
          identityVerifyAttempts: attempts,
          identityLockedUntil: locked
            ? addMinutes(new Date(), this.cfg('IDENTITY_VERIFY_LOCKOUT_MINUTES', 30))
            : undefined,
        },
      });
      await this.auditOutbox.enqueueStandalone({
        type: locked ? 'account.activation.identity_locked' : 'account.activation.identity_verification_failed',
        actor: { principalType: 'patient', id: request.patientId },
        subject: { type: 'AccountActivationRequest', id: request.id },
        payload: { attempts },
      });
      throw new BadRequestException(
        locked
          ? 'Too many failed verification attempts. This link is now temporarily locked.'
          : 'Date of birth (or Medicare number) does not match our records.',
      );
    }

    await this.prisma.accountActivationRequest.update({
      where: { id: request.id },
      data: { status: 'identity_verified', identityVerifiedAt: new Date(), identityVerifyAttempts: 0 },
    });
    await this.auditOutbox.enqueueStandalone({
      type: 'account.activation.identity_verified',
      actor: { principalType: 'patient', id: request.patientId },
      subject: { type: 'AccountActivationRequest', id: request.id },
      payload: {},
    });

    return { status: 'identity_verified' as const };
  }

  // ---------------------------------------------------------------------
  // Step 3/4: "is this for you, or are you helping someone else?"
  // ---------------------------------------------------------------------

  async selectBranch(token: string, dto: SelectBranchDto) {
    const request = await this.findActiveRequestByToken(token, ['identity_verified']);
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: request.patientId } });

    if (patient.isMinor && dto.role === 'patient') {
      // Partial fill of the open "minors as primary patients" design gap
      // flagged in minors-multigp-exception-paths.md ("hasn't been designed
      // at all") — documented judgment call, see BUILD_LOG/onboarding-account.md.
      throw new BadRequestException(
        'This patient is recorded as a minor and cannot self-manage a ReferralPlatform account — a parent or ' +
          "guardian must complete this step as the patient's carer.",
      );
    }

    let targetType: 'patient' | 'carer';
    let targetId: string;
    let targetEmail: string;
    let targetFirstName: string;
    let purpose: 'account_activation' | 'carer_email_verification';

    if (dto.role === 'patient') {
      targetType = 'patient';
      targetId = patient.id;
      targetEmail = patient.email ?? request.linkEmail;
      targetFirstName = patient.givenName;
      purpose = 'account_activation';
    } else {
      if (!dto.carer) {
        throw new BadRequestException('carer details are required when role is "carer"');
      }
      const suspectedOrganisationalCarer = await this.detectOrganisationalCarer(
        patient.id,
        dto.carer.email,
        dto.carer.sharesPatientMobileNumber ? undefined : dto.carer.ownMobileNumber,
      );

      const carer = await this.prisma.carer.create({
        data: {
          patientId: patient.id,
          activationRequestId: request.id,
          givenName: dto.carer.givenName,
          familyName: dto.carer.familyName,
          email: dto.carer.email,
          relationship: dto.carer.relationship,
          // Nominated delegate (low-friction) tier only — elevation to
          // authorised_representative requires the document-upload + review
          // path owned by the Consent & Security Service, out of this
          // service's scope. See identity-security-recommendations.md §2.
          tier: 'nominated_delegate',
          sharesPatientMobileNumber: dto.carer.sharesPatientMobileNumber,
          ownMobileNumber: dto.carer.sharesPatientMobileNumber ? undefined : dto.carer.ownMobileNumber,
          nextReattestationDueAt: addDays(new Date(), this.cfg('REATTESTATION_INTERVAL_DAYS', 365)),
          suspectedOrganisationalCarer,
        },
      });
      targetType = 'carer';
      targetId = carer.id;
      targetEmail = carer.email;
      targetFirstName = carer.givenName;
      purpose = 'carer_email_verification';

      await this.auditOutbox.enqueueStandalone({
        type: 'carer.registered',
        actor: { principalType: 'carer', id: carer.id },
        subject: { type: 'Patient', id: patient.id },
        payload: {
          carerId: carer.id,
          relationship: carer.relationship,
          tier: carer.tier,
          suspectedOrganisationalCarer,
        },
      });
      if (suspectedOrganisationalCarer) {
        await this.auditOutbox.enqueueStandalone({
          type: 'carer.suspected_organisational',
          actor: { principalType: 'system', id: 'onboarding-account-service' },
          subject: { type: 'Carer', id: carer.id },
          payload: { email: carer.email },
        });
      }
    }

    await this.prisma.accountActivationRequest.update({
      where: { id: request.id },
      data: { status: 'branch_selected', role: dto.role },
    });
    await this.auditOutbox.enqueueStandalone({
      type: 'account.activation.branch_selected',
      actor: { principalType: dto.role, id: targetId },
      subject: { type: 'AccountActivationRequest', id: request.id },
      payload: { role: dto.role },
    });

    await this.issueAndSendOtp(request.id, targetType, targetId, targetEmail, targetFirstName, purpose);

    return { status: 'otp_sent' as const, otpDeliveryChannel: 'email' as const };
  }

  private async detectOrganisationalCarer(
    patientId: string,
    email: string,
    ownMobileNumber?: string,
  ): Promise<boolean> {
    const threshold = this.cfg('ORG_CARER_THRESHOLD', 3);
    const matches = await this.prisma.carer.findMany({
      where: {
        patientId: { not: patientId },
        OR: [{ email: { equals: email, mode: 'insensitive' } }, ...(ownMobileNumber ? [{ ownMobileNumber }] : [])],
      },
      select: { patientId: true },
    });
    const distinctPatients = new Set(matches.map((m: { patientId: string }) => m.patientId));
    return distinctPatients.size + 1 >= threshold;
  }

  // ---------------------------------------------------------------------
  // OTP issue / verify / resend
  // ---------------------------------------------------------------------

  private async issueAndSendOtp(
    activationRequestId: string,
    targetType: 'patient' | 'carer',
    targetId: string,
    emailAddress: string,
    firstName: string,
    purpose: 'account_activation' | 'carer_email_verification',
  ) {
    const code = generateOtpCode();
    const expiresAt = addMinutes(new Date(), this.cfg('OTP_TTL_MINUTES', 10));

    await this.prisma.otpChallenge.create({
      data: {
        activationRequestId,
        targetType,
        targetId,
        purpose,
        emailAddress,
        codeHash: hashOtpCode(code, this.otpSecret()),
        maxAttempts: this.cfg('OTP_MAX_ATTEMPTS', 5),
        expiresAt,
      },
    });
    await this.auditOutbox.enqueueStandalone({
      type: 'account.otp.sent',
      actor: { principalType: targetType, id: targetId },
      subject: { type: 'AccountActivationRequest', id: activationRequestId },
      payload: { purpose },
    });

    await this.email.sendOtpEmail({ to: emailAddress, recipientFirstName: firstName, code, expiresAt });
  }

  async resendOtp(token: string) {
    const request = await this.findActiveRequestByToken(token, ['branch_selected']);

    const oneHourAgo = addHours(new Date(), -1);
    const recentSends = await this.prisma.otpChallenge.count({
      where: { activationRequestId: request.id, createdAt: { gte: oneHourAgo } },
    });
    if (recentSends >= this.cfg('OTP_RESEND_MAX_PER_HOUR', 5)) {
      throw new ForbiddenException('Too many verification code requests — try again later.');
    }

    const { targetType, targetId, emailAddress, firstName, purpose } = await this.currentOtpTarget(request);
    await this.issueAndSendOtp(request.id, targetType, targetId, emailAddress, firstName, purpose);
    return { status: 'otp_sent' as const };
  }

  private async currentOtpTarget(request: { id: string; patientId: string; role: string | null; linkEmail: string }) {
    if (request.role === 'carer') {
      const carer = await this.prisma.carer.findUniqueOrThrow({ where: { activationRequestId: request.id } });
      return {
        targetType: 'carer' as const,
        targetId: carer.id,
        emailAddress: carer.email,
        firstName: carer.givenName,
        purpose: 'carer_email_verification' as const,
      };
    }
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: request.patientId } });
    return {
      targetType: 'patient' as const,
      targetId: patient.id,
      // Falls back to the email the activation link itself was sent to
      // (never to any other internal id) if the patient record somehow has
      // no email set at this point.
      emailAddress: patient.email ?? request.linkEmail,
      firstName: patient.givenName,
      purpose: 'account_activation' as const,
    };
  }

  async verifyOtp(token: string, dto: VerifyOtpDto) {
    const request = await this.findActiveRequestByToken(token, ['branch_selected']);

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { activationRequestId: request.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new NotFoundException('No pending verification code for this activation request — request a new one.');
    }
    if (challenge.lockedUntil && challenge.lockedUntil > new Date()) {
      throw new ForbiddenException(`Too many failed attempts. Try again after ${challenge.lockedUntil.toISOString()}.`);
    }
    if (challenge.expiresAt < new Date()) {
      throw new BadRequestException('This verification code has expired — request a new one.');
    }

    const isCorrect = verifyOtpCode(dto.code, challenge.codeHash, this.otpSecret());
    if (!isCorrect) {
      const attempts = challenge.attemptCount + 1;
      const locked = attempts >= challenge.maxAttempts;
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          attemptCount: attempts,
          lockedUntil: locked ? addMinutes(new Date(), this.cfg('OTP_LOCKOUT_MINUTES', 30)) : undefined,
        },
      });
      await this.auditOutbox.enqueueStandalone({
        type: locked ? 'account.otp.locked' : 'account.otp.failed',
        actor: { principalType: challenge.targetType as 'patient' | 'carer', id: challenge.targetId },
        subject: { type: 'AccountActivationRequest', id: request.id },
        payload: { attempts },
      });
      throw new BadRequestException(
        locked ? 'Too many failed attempts. This code is now locked.' : 'Incorrect verification code.',
      );
    }

    const now = new Date();
    const activatedPatient = await this.prisma.$transaction(async (tx) => {
      await tx.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } });

      if (challenge.targetType === 'carer') {
        await tx.carer.update({ where: { id: challenge.targetId }, data: { emailVerifiedAt: now } });
        await this.auditOutbox.enqueue(tx, {
          type: 'carer.email_verified',
          actor: { principalType: 'carer', id: challenge.targetId },
          subject: { type: 'Carer', id: challenge.targetId },
          payload: {},
        });
      }

      const patient = await tx.patient.update({
        where: { id: request.patientId },
        data: { status: 'active' },
      });
      await this.auditOutbox.enqueue(tx, {
        type: 'account.activated', // already a shared-types AuditEventType — no local extension needed.
        actor: { principalType: challenge.targetType as 'patient' | 'carer', id: challenge.targetId },
        subject: { type: 'Patient', id: patient.id },
        payload: { role: request.role, activationRequestId: request.id },
      });

      await tx.accountActivationRequest.update({
        where: { id: request.id },
        data: { status: 'activated', activatedAt: now },
      });
      await this.auditOutbox.enqueue(tx, {
        type: 'account.otp.verified',
        actor: { principalType: challenge.targetType as 'patient' | 'carer', id: challenge.targetId },
        subject: { type: 'AccountActivationRequest', id: request.id },
        payload: {},
      });

      return { patient };
    });

    // Best-effort passkey enrolment prompt — see IdentityAccessClient's doc
    // comment for the documented cross-service gap. Never blocks activation.
    // NOTE: no real Keycloak user is provisioned for a patient/carer
    // anywhere in this build (a separate, equally-documented gap — see
    // BUILD_LOG/onboarding-account.md) so `challenge.targetId` (this
    // service's own Patient/Carer id, not a Keycloak subject id) is passed
    // through as a placeholder; the call is a documented no-op until both
    // gaps are closed together.
    const promptResult = await this.identityAccess.promptPasskeyEnrolment({
      keycloakUserId: challenge.targetId,
      principalType: challenge.targetType as 'patient' | 'carer',
    });
    await this.auditOutbox.enqueueStandalone({
      type: promptResult.prompted ? 'account.passkey_enrolment.prompted' : 'account.passkey_enrolment.prompt_failed',
      actor: { principalType: 'system', id: 'onboarding-account-service' },
      subject: { type: 'Patient', id: activatedPatient.patient.id },
      payload: { reason: promptResult.reason },
    });

    return {
      status: 'activated' as const,
      patientId: activatedPatient.patient.id,
      role: request.role,
      queueExpiresAt: request.queueExpiresAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------
  // Shared lookup helper
  // ---------------------------------------------------------------------

  private async findActiveRequestByToken(token: string, allowedStatuses: string[]) {
    const tokenHash = hashActivationToken(token);
    const request = await this.prisma.accountActivationRequest.findUnique({ where: { tokenHash } });
    if (!request) {
      throw new NotFoundException('Invalid or unknown activation link.');
    }
    if (request.linkExpiresAt < new Date()) {
      throw new BadRequestException('This activation link has expired. Ask your GP to resend it.');
    }
    if (!allowedStatuses.includes(request.status)) {
      throw new BadRequestException(
        `This activation request is not in a valid state for this step (current status: ${request.status}).`,
      );
    }
    return request;
  }
}
