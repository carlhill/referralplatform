import { config } from './config';
import { apiFetch } from './http';
import type { FollowUpPlan } from './types';

export function listFollowUpPlansForPatient(
  token: string,
  patientId: string,
  status?: string,
): Promise<FollowUpPlan[]> {
  return apiFetch(config.followUpRecallUrl, '/follow-up-plans', { token, query: { patientId, status } });
}

export function selfReportCompletion(
  token: string,
  id: string,
  input: { reportedBy: 'patient' | 'carer' | 'gp'; note?: string },
): Promise<FollowUpPlan> {
  return apiFetch(config.followUpRecallUrl, `/follow-up-plans/${id}/self-report`, {
    method: 'POST',
    token,
    body: input,
  });
}
