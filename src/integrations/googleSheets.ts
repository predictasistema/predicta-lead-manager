import { google } from 'googleapis';
import { Lead } from '../types/lead';
import { LeadStatus } from '../config/statuses';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;
const SHEET = 'leads';

// Colonne: A=Nome B=Cognome C=Telefono D=Email E=Fonte F=Campagna
//          G=Data compilazione H=Status I=Data appuntamento
//          J=Ora appuntamento K=Tentativi chiamata L=Note

function getAuth() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!keyRaw) throw new Error('Google credentials missing');
  let key;
  try { key = JSON.parse(keyRaw); }
  catch { key = JSON.parse(Buffer.from(keyRaw, 'base64').toString()); }
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function rowToLead(row: string[], rowIndex: number): Lead {
  return {
    id: String(rowIndex),
    nome: row[0] ?? '',
    cognome: row[1] ?? '',
    telefono: row[2] ?? '',
    email: row[3] ?? '',
    fonte: row[4] ?? '',
    campagna: row[5] ?? '',
    dataCompilazione: row[6] ?? '',
    status: (row[7] ?? 'nuovo') as LeadStatus,
    dataAppuntamento: row[8] ?? '',
    oraAppuntamento: row[9] ?? '',
    tentativiChiamata: Number(row[10] ?? 0),
    noteChiamata: row[11] ?? '',
      prossimaTentativo: row[12] ?? '',
      feedbackMedico: row[13] ?? '',
      dataUltimoAggiornamento: row[14] ?? '',
  };
}

export async function getLeads(): Promise<Lead[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET}!A2:L`,
  });
  const rows = res.data.values ?? [];
  return rows
    .map((row, i) => rowToLead(row, i + 2))
    .filter(lead => ['nuovo', 'da_ricontattare', 'non_risponde'].includes(lead.status));
}

export async function updateLead(telefono: string, updates: Partial<Lead>): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET}!A2:L`,
  });
  const rows = res.data.values ?? [];
  const rowIndex = rows.findIndex(r => r[2] === telefono);
  if (rowIndex === -1) throw new Error(`Lead non trovato: ${telefono}`);
  const sheetRow = rowIndex + 2;

  const colMap: Record<string, string> = {
    status: 'H', dataAppuntamento: 'I', oraAppuntamento: 'J',
    tentativiChiamata: 'K', noteChiamata: 'L',
  };

  const batchData = [];
  for (const [key, value] of Object.entries(updates)) {
    const col = colMap[key];
    if (!col) continue;
    batchData.push({
      range: `${SHEET}!${col}${sheetRow}`,
      values: [[value != null ? String(value) : '']],
    });
  }

  if (batchData.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: batchData },
    });
  }
}

export async function getPipelineLeads(): Promise<Lead[]> {
  return getLeads();
}

export async function updatePipelineRow(telefono: string, updates: any): Promise<void> {
  return updateLead(telefono, updates);
}

export async function getAllLeads(): Promise<Lead[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET}!A2:L`,
  });
  const rows = res.data.values ?? [];
  return rows.map((row, i) => rowToLead(row, i + 2));
}
