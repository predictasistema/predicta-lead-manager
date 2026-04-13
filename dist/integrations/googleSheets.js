"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNewLeads = getNewLeads;
exports.updateLeadStatus = updateLeadStatus;
exports.appendToPipeline = appendToPipeline;
exports.getPipelineLeads = getPipelineLeads;
exports.updatePipelineRow = updatePipelineRow;
const googleapis_1 = require("googleapis");
const statuses_1 = require("../config/statuses");
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
function getAuth() {
    const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const credentials = JSON.parse(keyRaw.startsWith('{') ? keyRaw : Buffer.from(keyRaw, 'base64').toString());
    return new googleapis_1.google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
}
function getSheets() {
    return googleapis_1.google.sheets({ version: 'v4', auth: getAuth() });
}
// ──────────────────────────────────────────────────────────────
// Mapping LeadStatus ↔ Fase commerciale (colonna G pipeline)
// ──────────────────────────────────────────────────────────────
function statusToFase(status) {
    switch (status) {
        case statuses_1.STATUSES.NUOVO:
        case statuses_1.STATUSES.IN_CHIAMATA:
            return 'Nuovo lead';
        case statuses_1.STATUSES.SCHEDULED_CALL:
        case statuses_1.STATUSES.DA_RICONTATTARE:
        case statuses_1.STATUSES.INFO_INVIATE:
        case statuses_1.STATUSES.NON_RISPONDE:
        case statuses_1.STATUSES.NON_INTERESSATO:
        case statuses_1.STATUSES.NUMERO_ERRATO:
            return 'Qualificato';
        case statuses_1.STATUSES.APPUNTAMENTO_FISSATO:
            return 'Appuntamento fissato';
        case statuses_1.STATUSES.APPUNTAMENTO_COMPLETATO:
        case statuses_1.STATUSES.NO_SHOW:
            return 'Appuntamento svolto';
        case statuses_1.STATUSES.GIA_CLIENTE:
            return 'Convertito';
        default:
            return 'Nuovo lead';
    }
}
function faseToStatus(fase) {
    switch (fase.toLowerCase()) {
        case 'appuntamento fissato': return statuses_1.STATUSES.APPUNTAMENTO_FISSATO;
        case 'appuntamento svolto': return statuses_1.STATUSES.APPUNTAMENTO_COMPLETATO;
        case 'convertito': return statuses_1.STATUSES.GIA_CLIENTE;
        case 'qualificato': return statuses_1.STATUSES.SCHEDULED_CALL;
        default: return statuses_1.STATUSES.NUOVO;
    }
}
// ──────────────────────────────────────────────────────────────
// Foglio "leads"  — A=nome B=cognome C=telefono D=email
//                   E=fonte F=campagna G=dataCompilazione H=status
// ──────────────────────────────────────────────────────────────
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
        status: ((row[7] ?? statuses_1.STATUSES.NUOVO).toLowerCase()),
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
function pipelineRowToLead(row, rowIndex) {
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
function leadToPipelineRow(lead) {
    const oggi = new Date().toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
    return [
        lead.nome, // A — Nome
        lead.cognome, // B — Cognome
        lead.telefono, // C — Telefono
        lead.email, // D — Email
        lead.campagna, // E — Campagna
        lead.dataCompilazione, // F — Data lead
        statusToFase(lead.status), // G — Fase
        oggi, // H — Data aggiornamento
        lead.noteChiamata, // I — Note
        '', // J — Valore stimato € (compilato manualmente)
    ];
}
// ──────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────
async function getNewLeads() {
    if (!SPREADSHEET_ID)
        throw new Error('GOOGLE_SHEETS_ID non configurato nel .env');
    const sheets = getSheets();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'leads!A2:H',
    });
    const rows = response.data.values ?? [];
    const result = [];
    rows.forEach((row, i) => {
        const status = (row[7] ?? '').toLowerCase();
        if (status === statuses_1.STATUSES.NUOVO) {
            result.push({ ...rowToLead(row, i + 2), rowIndex: i + 2 });
        }
    });
    return result;
}
async function updateLeadStatus(rowIndex, status, extra) {
    if (!SPREADSHEET_ID)
        throw new Error('GOOGLE_SHEETS_ID non configurato nel .env');
    const sheets = getSheets();
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `leads!H${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[status]] },
    });
    if (!extra || Object.keys(extra).length === 0)
        return;
    const colMap = {
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
async function appendToPipeline(lead) {
    if (!SPREADSHEET_ID)
        throw new Error('GOOGLE_SHEETS_ID non configurato nel .env');
    const sheets = getSheets();
    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'pipeline!A:J',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [leadToPipelineRow(lead)] },
    });
}
async function getPipelineLeads() {
    if (!SPREADSHEET_ID)
        throw new Error('GOOGLE_SHEETS_ID non configurato nel .env');
    const sheets = getSheets();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'pipeline!A2:J', // riga 1 = intestazioni, riga 2 = legenda
    });
    const rows = (response.data.values ?? []);
    return rows.map((row, i) => pipelineRowToLead(row, i + 2));
}
async function updatePipelineRow(telefono, fields) {
    if (!SPREADSHEET_ID)
        throw new Error('GOOGLE_SHEETS_ID non configurato nel .env');
    const sheets = getSheets();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'pipeline!A2:J', // dati da riga 3
    });
    const rows = (response.data.values ?? []);
    const rowIndex = rows.findIndex((row) => row[2] === telefono);
    if (rowIndex === -1) {
        throw new Error(`Nessuna riga trovata in pipeline per telefono: ${telefono}`);
    }
    // rowIndex è 0-based nell'array A2:J, la riga reale nel foglio è rowIndex + 2
    const sheetRowIndex = rowIndex + 2;
    // Colonne disponibili nel nuovo schema commerciale
    const colMap = {
        nome: 'A',
        cognome: 'B',
        telefono: 'C',
        email: 'D',
        campagna: 'E',
        dataCompilazione: 'F',
        noteChiamata: 'I',
    };
    const updates = [];
    for (const [key, value] of Object.entries(fields)) {
        if (key === 'status' && value != null) {
            // status → Fase (G) + Data fase (H)
            updates.push({
                range: `pipeline!G${sheetRowIndex}`,
                values: [[statusToFase(value)]],
            });
            updates.push({
                range: `pipeline!H${sheetRowIndex}`,
                values: [[new Date().toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })]],
            });
            continue;
        }
        const col = colMap[key];
        if (!col)
            continue; // campi operativi non presenti nel nuovo schema vengono ignorati
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
//# sourceMappingURL=googleSheets.js.map