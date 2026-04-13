import { Lead } from '../types/lead';

export async function sendWhatsApp(lead: Lead, message: string): Promise<string> {
  // TODO: implementare invio messaggio WhatsApp tramite Twilio
  // Restituisce il messageSid
  throw new Error('Not implemented');
}

export async function sendWhatsAppToMedico(message: string): Promise<string> {
  // TODO: implementare invio messaggio WhatsApp al medico tramite Twilio
  // Restituisce il messageSid
  throw new Error('Not implemented');
}
