import { google } from 'googleapis';
import { Lead } from '../types/lead';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

function getAuth() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!;
  const credentials = JSON.parse(keyRaw.startsWith('{') ? keyRaw : Buffer.from(keyRaw, 'base64').toString());
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

function getCalendar() {
  return google.calendar({ version: 'v3', auth: getAuth() });
}

// lead.dataAppuntamento: "YYYY-MM-DD", lead.oraAppuntamento: "HH:MM"
function buildEventDateTime(date: string, time: string): { dateTime: string; timeZone: string } {
  return {
    dateTime: `${date}T${time}:00`,
    timeZone: 'Europe/Rome',
  };
}

export async function createAppointment(lead: Lead): Promise<string> {
  if (!lead.dataAppuntamento || !lead.oraAppuntamento) {
    throw new Error(
      `Lead ${lead.telefono}: dataAppuntamento o oraAppuntamento mancanti`,
    );
  }

  const calendar = getCalendar();

  const startDateTime = buildEventDateTime(lead.dataAppuntamento, lead.oraAppuntamento);

  // End = start + 60 minutes
  const startDate = new Date(`${lead.dataAppuntamento}T${lead.oraAppuntamento}:00`);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const endDateStr = endDate.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
  const endDateTime = buildEventDateTime(
    endDateStr.slice(0, 10),
    endDateStr.slice(11, 16),
  );

  const description = [
    `Email: ${lead.email}`,
    `Telefono: ${lead.telefono}`,
    `Fonte: ${lead.fonte}`,
    `Campagna: ${lead.campagna}`,
    `Data compilazione: ${lead.dataCompilazione}`,
  ].join('\n');

  const response = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: `Visita – ${lead.nome} ${lead.cognome}`,
      description,
      start: startDateTime,
      end: endDateTime,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 24h prima
          { method: 'email', minutes: 2 * 60 },  // 2h prima
        ],
      },
    },
  });

  const eventId = response.data.id;
  if (!eventId) throw new Error('Google Calendar non ha restituito un eventId');
  return eventId;
}

export async function deleteAppointment(eventId: string): Promise<void> {
  const calendar = getCalendar();
  await calendar.events.delete({
    calendarId: CALENDAR_ID,
    eventId,
  });
}
