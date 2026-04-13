import { Lead } from '../types/lead';
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendWhatsApp(lead: Lead, message: string): Promise<string> {
  const result = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM!,
    to: `whatsapp:${lead.telefono}`,
    body: message,
  });
  return result.sid;
}

export async function sendWhatsAppToMedico(message: string): Promise<string> {
  const result = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM!,
    to: `whatsapp:${process.env.MEDICO_WHATSAPP}`,
    body: message,
  });
  return result.sid;
}
