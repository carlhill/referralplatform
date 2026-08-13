import { config } from './config';
import { apiFetch } from './http';
import type { MessageThread, ThreadMessage } from './types';

export function createOrGetThread(
  token: string,
  referralId: string,
  input: { subject?: string; initialMessage?: string } = {},
): Promise<MessageThread> {
  return apiFetch(config.notificationUrl, `/referrals/${referralId}/message-threads`, {
    method: 'POST',
    token,
    body: input,
  });
}

export function listThreadsForReferral(token: string, referralId: string): Promise<MessageThread[]> {
  return apiFetch(config.notificationUrl, `/referrals/${referralId}/message-threads`, { token });
}

export function getThread(token: string, id: string): Promise<MessageThread> {
  return apiFetch(config.notificationUrl, `/message-threads/${id}`, { token });
}

export function listMessages(token: string, threadId: string): Promise<ThreadMessage[]> {
  return apiFetch(config.notificationUrl, `/message-threads/${threadId}/messages`, { token });
}

export function postMessage(token: string, threadId: string, body: string): Promise<ThreadMessage> {
  return apiFetch(config.notificationUrl, `/message-threads/${threadId}/messages`, {
    method: 'POST',
    token,
    body: { body },
  });
}

export function resolveThread(token: string, threadId: string, note?: string): Promise<MessageThread> {
  return apiFetch(config.notificationUrl, `/message-threads/${threadId}/resolve`, {
    method: 'POST',
    token,
    body: { note },
  });
}
