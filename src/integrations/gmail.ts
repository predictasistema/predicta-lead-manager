import { Lead } from '../types/lead';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendFeedbackRequestToMedico(lead: Lead): Promise<void> {
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.MEDICO_EMAIL,
    subject: `Feedback appuntamento - ${lead.nome} ${lead.cognome}`,
    text: `Gentile dottore,\n\nIl paziente ${lead.nome} ${lead.cognome} (${lead.telefono}) aveva un appuntamento.\n\nSi è presentato? Risponda a questa email con:\n- "si presentato" se è venuto\n- "no show" se non si è presentato\n\nGrazie,\nSistema Predicta`,
  });
}

export async function readFeedbackReplies(): Promise<Array<{ leadId: string; feedback: string }>> {
  // Per ora restituisce array vuoto - da implementare con IMAP se necessario
  return [];
}
