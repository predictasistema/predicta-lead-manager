import { google } from 'googleapis';
import { Lead } from '../types/lead';
import { LeadStatus, STATUSES } from '../config/statuses';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;

function getAuth() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!;
  const credentials = JSON.parse(
    keyRaw.startsWith('{') ? keyRaw : Buffer.from(keyRaw, 'base64').toString(),
  );
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

// ──────────────────────────────────────────────────────────────
// Mapping LeadStatus ↔ Fase commerciale (colonna G pipeline)
// ──────────────────────────────────────────────────────────────

function statusToFase(status: LeadStatus): string {
  switch (status) {
    case STATUSES.NUOVO:
    case STATUSES.IN_CHIAMATA:
      return 'Nuovo lead';
    case STATUSES.SCHEDULED_CALL:
    case STATUSES.DA_RICONTATTARE:
    case STATUSES.INFO_INVIATE:
    case STATUSES.NON_RISPONDE:
    case STATUSES.NON_INTERESSATO:
    case STATUSES.NUMERO_ERRATO:
      return 'Qualificato';
    case STATUSES.APPUNTAMENTO_FISSATO:
      return 'Appuntamento fissato';
    case STATUSES.APPUNTAMENTO_COMPLETATO:
    case STATUSES.NO_SHOW:
      return 'Appuntamento svolto';
    case STATUSES.GIA_CLIENTE:
      return 'Convertito';
    default:
      return 'Nuovo lead';
  }
}

function faseToStatus(fase: string): LeadStatus {
  switch (fase.toLowerCase()) {
    case 'appuntamento fissato': return STATUSES.APPUNTAMENTO_FISSATO;
    case 'appuntamento svolto':  return STATUSES.APPUNTAMENTO_COMPLETATO;
    case 'convertito':           return STATUSES.GIA_CLIENTE;
    case 'qualificato':          return STATUSES.SCHEDULED_CALL;
    default:                     return STATUSES.NUOVO;
  }
}

// ──────────────────────────────────────────────────────────────
// Foglio "leads"  — A=nome B=cognome C=telefono D=email
//                   E=fonte F=campagna G=dataCompilazione H=status
// ──────────────────────────────────────────────────────────────

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
    status: ((row[7] ?? STATUSES.NUOVO).toLowerCase()) as LeadStatus,
    tentativiChiamata: 0,
    prossimaTentativo: null,
    dataAppuntamento: null,
    oraAppuntamento: null,
    noteChiamata: '',
    feedbackMedico: '',
    dataUltimoAggiornamento: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────────────────
// Foglio "pipeline" — struttura commerciale (10 colonne)
//   A=nome  B=cognome  C=telefono  D=email  E=campagna
//   F=dataLead  G=fase  H=dataAggiornamento  I=note  J=valoreStimat€
//
// Riga 1 = intestazioni (grassetto, sfondo grigio scuro, testo bianco)
// Dati   = da riga 2 in poi
// ──────────────────────────────────────────────────────────────

function pipelineRowToLead(row: string[], rowIndex: number): Lead {
  return {
    id: String(rowIndex),
    nome: row[0] ?? '',
    cognome: row[1] ?? '',
    telefono: row[2] ?? '',
    email: row[3] ?? '',
    fonte: '',
    campagna: row[4] ?? '',
    dataCompilazione: row[5] ?? '',
    status: faseToStatus((row[6] ?? '').toLowerCase()),
    tentativiChiamata: 0,
    prossimaTentativo: null,
    dataAppuntamento: null,
    oraAppuntamento: null,
    noteChiamata: row[8] ?? '',
    feedbackMedico: '',
    dataUltimoAggiornamento: row[7] ?? '',
  };
}

function leadToPipelineRow(lead: Lead): string[] {
  const oggi = new Date().toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
  return [
    lead.nome,                   // A — Nome
    lead.cognome,                // B — Cognome
    lead.telefono,               // C — Telefono
    lead.email,                  // D — Email
    lead.campagna,               // E — Campagna
    lead.dataCompilazione,       // F — Data lead
    statusToFase(lead.status),   // G — Fase
    oggi,                        // H — Data aggiornamento
    lead.noteChiamata,           // I — Note
    '',                          // J — Valore stimato € (compilato manualmente)
  ];
}

// ──────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────

export async function getNewLeads(): Promise<Array<Lead & { rowIndex: number }>> {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEETS_ID non configurato nel .env');
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'leads!A2:H',
  });

  const rows = response.data.values ?? [];
  const result: Array<Lead & { rowIndex: number }> = [];

  rows.forEach((row, i) => {
    const status = (row[7] ?? '').toLowerCase();
    if (status === STATUSES.NUOVO) {
      result.push({ ...rowToLead(row, i + 2), rowIndex: i + 2 });
    }
  });

  return result;
}

export async function updateLeadStatus(
  rowIndex: number,
  status: LeadStatus,
  extra?: Partial<Lead>,
): Promise<void> {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEETS_ID non configurato nel .env');
  const sheets = getSheets();

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `leads!H${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[status]] },
  });

  if (!extra || Object.keys(extra).length === 0) return;

  const colMap: Record<string, string> = {
    nome: 'A', cognome: 'B', telefono: 'C',
    email: 'D', fonte: 'E', campagna: 'F', dataCompilazione: 'G',
  };

  const updateRequests = Object.entries(extra)
    .filter(([key]) => colMap[key])
    .map(([key, value]) => ({
      range: `leads!${colMap[key]}${rowIndex}`,
      values: [[value ?? '']],
    }));

  if (updateRequests.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: updateRequests },
    });
  }
}

export async function appendToPipeline(lead: Lead): Promise<void> {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEETS_ID non configurato nel .env');
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'pipeline!A:J',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [leadToPipelineRow(lead)] },
  });
}

export async function getPipelineLeads(): Promise<Lead[]> {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEETS_ID non configurato nel .env');
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'pipeline!A2:J', // riga 1 = intestazioni, riga 2 = legenda
  });

  const rows: string[][] = (response.data.values ?? []) as string[][];
  return rows.map((row: string[], i: number) => pipelineRowToLead(row, i + 2));
}

export async function updatePipelineRow(
  telefono: string,
  fields: Partial<Lead>,
): Promise<void> {
  if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEETS_ID non configurato nel .env');
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'pipeline!A2:J', // dati da riga 3
  });

  const rows: string[][] = (response.data.values ?? []) as string[][];
  const rowIndex = rows.findIndex((row: string[]) => row[2] === telefono);
  if (rowIndex === -1) {
    throw new Error(`Nessuna riga trovata in pipeline per telefono: ${telefono}`);
  }

  // rowIndex è 0-based nell'array A2:J, la riga reale nel foglio è rowIndex + 2
  const sheetRowIndex = rowIndex + 2;

  // Colonne disponibili nel nuovo schema commerciale
  const colMap: Record<string, string> = {
    nome: 'A',
    cognome: 'B',
    telefono: 'C',
    email: 'D',
    campagna: 'E',
    dataCompilazione: 'F',
    noteChiamata: 'I',
  };

  const updates: Array<{ range: string; values: string[][] }> = [];

  for (const [key, value] of Object.entries(fields)) {
    if (key === 'status' && value != null) {
      // status → Fase (G) + Data fase (H)
      updates.push({
        range: `pipeline!G${sheetRowIndex}`,
        values: [[statusToFase(value as LeadStatus)]],
      });
      updates.push({
        range: `pipeline!H${sheetRowIndex}`,
        values: [[new Date().toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })]],
      });
      continue;
    }
    const col = colMap[key];
    if (!col) continue; // campi operativi non presenti nel nuovo schema vengono ignorati
    updates.push({
      range: `pipeline!${col}${sheetRowIndex}`,
      values: [[value != null ? String(value) : '']],
    });
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: updates },
    });
  }
}
