/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config();

import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!;

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
// Intestazioni
// ──────────────────────────────────────────────────────────────

const HEADERS_LEADS = [
  'Nome', 'Cognome', 'Telefono', 'Email',
  'Fonte', 'Campagna', 'Data compilazione', 'Status',
];

const HEADERS_PIPELINE = [
  'Nome', 'Cognome', 'Telefono', 'Email',
  'Campagna', 'Data lead', 'Fase', 'Data aggiornamento',
  'Note', 'Valore stimato €',
];

// Fasi + formattazione condizionale — colori RGB (0.0–1.0)
const FASI_CF = [
  { label: 'Nuovo lead',           red: 0.85, green: 0.85, blue: 0.85 }, // grigio chiaro
  { label: 'Qualificato',          red: 1.00, green: 0.95, blue: 0.20 }, // giallo
  { label: 'Appuntamento fissato', red: 1.00, green: 0.65, blue: 0.00 }, // arancione
  { label: 'Appuntamento svolto',  red: 0.67, green: 0.84, blue: 0.90 }, // blu chiaro
  { label: 'Convertito',           red: 0.35, green: 0.82, blue: 0.35 }, // verde
];

// ──────────────────────────────────────────────────────────────
// Foglio "leads" — solo intestazioni + grassetto
// ──────────────────────────────────────────────────────────────

async function initLeads(sheetId: number): Promise<void> {
  const sheets = getSheets();
  const lastCol = String.fromCharCode(64 + HEADERS_LEADS.length); // H

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `leads!A1:${lastCol}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS_LEADS] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: HEADERS_LEADS.length,
            },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        },
      ],
    },
  });
}

// ──────────────────────────────────────────────────────────────
// Foglio "pipeline" — struttura commerciale pulita
// ──────────────────────────────────────────────────────────────

async function initPipeline(sheetId: number): Promise<void> {
  const sheets = getSheets();

  // 1. Cancella tutto il contenuto esistente (incluse colonne K–N residue)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: 'pipeline!A:Z',
  });

  // 2. Scrivi intestazioni in riga 1
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'pipeline!A1:J1',
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS_PIPELINE] },
  });

  // 3. Formattazione + freeze + dropdown + conditional formatting (singola chiamata)
  const conditionalRules = FASI_CF.map((fase, i) => ({
    addConditionalFormatRule: {
      index: i,
      rule: {
        ranges: [{
          sheetId,
          startRowIndex: 1,   // riga 2 (0-based)
          endRowIndex: 10000,
          startColumnIndex: 6, // colonna G
          endColumnIndex: 7,
        }],
        booleanRule: {
          condition: {
            type: 'TEXT_EQ',
            values: [{ userEnteredValue: fase.label }],
          },
          format: {
            backgroundColor: { red: fase.red, green: fase.green, blue: fase.blue },
          },
        },
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        // Intestazioni riga 1: grassetto + sfondo grigio scuro + testo bianco
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: HEADERS_PIPELINE.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.18, green: 0.18, blue: 0.18 },
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
        // Freeze riga 1
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        // Dropdown sulla colonna G (Fase), dalla riga 2 in poi
        {
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: 1, // riga 2 (0-based)
              endRowIndex: 10000,
              startColumnIndex: 6,
              endColumnIndex: 7,
            },
            rule: {
              condition: {
                type: 'ONE_OF_LIST',
                values: FASI_CF.map((f) => ({ userEnteredValue: f.label })),
              },
              showCustomUi: true,
              strict: true,
            },
          },
        },
        // Formattazione condizionale colonna G
        ...conditionalRules,
      ],
    },
  });
}

// ──────────────────────────────────────────────────────────────
// Utility — recupera sheetId numerico per un foglio
// ──────────────────────────────────────────────────────────────

async function getSheetId(sheetName: string): Promise<number> {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetId = meta.data.sheets
    ?.find((s) => s.properties?.title === sheetName)
    ?.properties?.sheetId;
  if (sheetId == null) throw new Error(`Sheet "${sheetName}" non trovato nello spreadsheet`);
  return sheetId;
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const leadsSheetId = await getSheetId('leads');
  await initLeads(leadsSheetId);
  console.log('✓ Foglio leads inizializzato');

  const pipelineSheetId = await getSheetId('pipeline');
  await initPipeline(pipelineSheetId);
  console.log('✓ Foglio pipeline inizializzato');
}

main().catch((err) => {
  console.error("Errore durante l'inizializzazione:", err);
  process.exit(1);
});
