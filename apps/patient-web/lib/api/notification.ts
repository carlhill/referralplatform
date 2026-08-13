import { config } from './config';
import { apiFetch } from './http';
import type { MessageThread, ThreadMessage } from './types';

const base = () => config.notificationUrl;

// --- Referral-scoped secure message thread (shown on the referral detail screen) ---

export function createOrGetThread(token: string, referralId: string, subject?: string): Promise<MessageThread> {
  return apiFetch(base(), `/referrals/${referralId}/message-threads`, { method: 'POST', token, body: { subject } });
}

export function listThreadsForReferral(token: string, referralId: string): Promise<MessageThread[]> {
  return apiFetch(base(), `/referrals/${referralId}/message-threads`, { token });
}

export function getThread(token: string, id: string): Promise<MessageThread> {
  return apiFetch(base(), `/message-threads/${id}`, { token });
}

export function listMessages(token: string, threadId: string): Promise<ThreadMessage[]> {
  return apiFetch(base(), `/message-threads/${threadId}/messages`, { token });
}

export function postMessage(token: string, threadId: string, body: string): Promise<ThreadMessage> {
  return apiFetch(base(), `/message-threads/${threadId}/messages`, { method: 'POST', token, body: { body } });
}

// --- Push device registration (web push token, or a placeholder for mobile) ---

export function registerDevice(
  token: string,
  input: { recipientType: string; recipientId: string; token: string; platform: 'ios' | 'android' | 'web' },
): Promise<unknown> {
  return apiFetch(base(), '/notifications/devices', { method: 'POST', token, body: input });
}
