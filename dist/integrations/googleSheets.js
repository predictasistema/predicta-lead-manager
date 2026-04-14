"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeads = getLeads;
exports.updateLead = updateLead;
exports.getPipelineLeads = getPipelineLeads;
exports.updatePipelineRow = updatePipelineRow;
const googleapis_1 = require("googleapis");
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SHEET = 'leads';
// Colonne: A=Nome B=Cognome C=Telefono D=Email E=Fonte F=Campagna
//          G=Data compilazione H=Status I=Data appuntamento
//          J=Ora appuntamento K=Tentativi chiamata L=Note
function getAuth() {
    const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
    if (!keyRaw)
        throw new Error('Google credentials missing');
    let key;
    try {
        key = JSON.parse(keyRaw);
    }
    catch {
        key = JSON.parse(Buffer.from(keyRaw, 'base64').toString());
    }
    return new googleapis_1.google.auth.GoogleAuth({
        credentials: key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
}
function rowToLead(row, rowIndex) {
    return {
        id: String(rowIndex),
        nome: row[0] ?? '',
        cognome: row[1] ?? '',
        telefono: row[2] ?? '',
        email: row[3] ?? '',
        fonte: row[4] ?? '',
        campagna: row[5] ?? '',
        dataCompilazione: row[6] ?? '',
        status: (row[7] ?? 'nuovo'),
        dataAppuntamento: row[8] ?? '',
        oraAppuntamento: row[9] ?? '',
        tentativiChiamata: Number(row[10] ?? 0),
        noteChiamata: row[11] ?? '',
        prossimaTentativo: row[12] ?? '',
        feedbackMedico: row[13] ?? '',
        dataUltimoAggiornamento: row[14] ?? '',
    };
}
async function getLeads() {
    const auth = getAuth();
    const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!A2:L`,
    });
    const rows = res.data.values ?? [];
    return rows
        .map((row, i) => rowToLead(row, i + 2))
        .filter(lead => ['nuovo', 'da_ricontattare', 'non_risponde'].includes(lead.status));
}
async function updateLead(telefono, updates) {
    const auth = getAuth();
    const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!A2:L`,
    });
    const rows = res.data.values ?? [];
    const rowIndex = rows.findIndex(r => r[2] === telefono);
    if (rowIndex === -1)
        throw new Error(`Lead non trovato: ${telefono}`);
    const sheetRow = rowIndex + 2;
    const colMap = {
        status: 'H', dataAppuntamento: 'I', oraAppuntamento: 'J',
        tentativiChiamata: 'K', noteChiamata: 'L',
    };
    const batchData = [];
    for (const [key, value] of Object.entries(updates)) {
        const col = colMap[key];
        if (!col)
            continue;
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
async function getPipelineLeads() {
    return getLeads();
}
async function updatePipelineRow(telefono, updates) {
    return updateLead(telefono, updates);
}
//# sourceMappingURL=googleSheets.js.map