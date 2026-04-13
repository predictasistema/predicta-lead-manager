import { Lead } from '../types/lead';

export async function sendFeedbackRequestToMedico(lead: Lead): Promise<void> {
  // TODO: implementare invio email al medico per richiedere feedback
  throw new Error('Not implemented');
}

export async function readFeedbackReplies(): Promise<Array<{ leadId: string; feedback: string }>> {
  // TODO: implementare lettura risposte email con feedback dal medico
  throw new Error('Not implemented');
}
