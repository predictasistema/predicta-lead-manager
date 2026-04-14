"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLeadManagerCycle = runLeadManagerCycle;
exports.handleVapiWebhook = handleVapiWebhook;
exports.runFeedbackHandler = runFeedbackHandler;
const statuses_1 = require("../config/statuses");
const googleSheets_1 = require("../integrations/googleSheets");
const vapi_1 = require("../integrations/vapi");
const googleCalendar_1 = require("../integrations/googleCalendar");
const gmail_1 = require("../integrations/gmail");
const twilio_1 = require("../integrations/twilio");
// ──────────────────────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────────────────────
function ora() {
    return new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
}
function aggiungiOre(n) {
    return new Date(Date.now() + n * 60 * 60 * 1000).toISOString();
}
function isPast(dateStr) {
    if (!dateStr)
        return false;
    return new Date(dateStr) <= new Date();
}
// ──────────────────────────────────────────────────────────────
// CICLO PRINCIPALE
// ──────────────────────────────────────────────────────────────
async function runLeadManagerCycle() {
    console.log(`[${ora()}] ▶ Inizio ciclo lead manager`);
    // ── 1. Nuovi lead (status "nuovo" nel foglio leads) ──────────
    const nuoviLead = await (0, googleSheets_1.getLeads)();
    console.log(`[${ora()}] Nuovi lead trovati: ${nuoviLead.length}`);
    for (const lead of nuoviLead) {
        try {
            console.log(`[${ora()}] 📞 Nuovo lead: ${lead.nome} ${lead.cognome} (${lead.telefono})`);
            await (0, googleSheets_1.updateLead)(lead.telefono, { status: statuses_1.STATUSES.IN_CHIAMATA });
            const callId = await (0, vapi_1.startCall)(lead);
            console.log(`[${ora()}] ✅ Chiamata avviata per ${lead.nome} ${lead.cognome} (callId: ${callId})`);
        }
        catch (err) {
            console.error(`[${ora()}] ❌ Errore su nuovo lead ${lead.telefono}:`, err);
        }
    }
    // ── 2. Lead in pipeline con altri status ─────────────────────
    const pipeline = await (0, googleSheets_1.getPipelineLeads)();
    for (const lead of pipeline) {
        try {
            // non_risponde: richiama o manda WA finale
            if (lead.status === statuses_1.STATUSES.NON_RISPONDE && isPast(lead.prossimaTentativo)) {
                if (lead.tentativiChiamata < 3) {
                    console.log(`[${ora()}] 🔁 Richiamo non_risponde: ${lead.nome} ${lead.cognome}` +
                        ` (tentativo ${lead.tentativiChiamata + 1}/3)`);
                    await (0, vapi_1.startCall)(lead);
                }
                else {
                    console.log(`[${ora()}] 📱 Tentativi esauriti — WA finale a ${lead.nome} ${lead.cognome}`);
                    try {
                        await (0, twilio_1.sendWhatsApp)(lead, `Ciao ${lead.nome}, abbiamo cercato di contattarti più volte senza successo. ` +
                            `Se in futuro fossi interessato, siamo a tua disposizione.`);
                    }
                    catch (e) {
                        console.error("WhatsApp error:", e);
                    }
                    await (0, googleSheets_1.updatePipelineRow)(lead.telefono, { status: statuses_1.STATUSES.NON_INTERESSATO });
                }
                continue;
            }
            // scheduled_call scaduto
            if (lead.status === statuses_1.STATUSES.SCHEDULED_CALL && isPast(lead.prossimaTentativo)) {
                console.log(`[${ora()}] 📅 Richiamo scheduled_call: ${lead.nome} ${lead.cognome}`);
                await (0, vapi_1.startCall)(lead);
                continue;
            }
            // da_ricontattare scaduto
            if (lead.status === statuses_1.STATUSES.DA_RICONTATTARE && isPast(lead.prossimaTentativo)) {
                console.log(`[${ora()}] 🔄 Richiamo da_ricontattare: ${lead.nome} ${lead.cognome}`);
                await (0, vapi_1.startCall)(lead);
                continue;
            }
            // appuntamento_fissato nel passato → richiedi feedback al medico
            if (lead.status === statuses_1.STATUSES.APPUNTAMENTO_FISSATO) {
                const passato = lead.dataAppuntamento && lead.oraAppuntamento
                    ? isPast(`${lead.dataAppuntamento}T${lead.oraAppuntamento}:00`)
                    : false;
                if (passato) {
                    console.log(`[${ora()}] 📧 Richiesta feedback per ${lead.nome} ${lead.cognome}` +
                        ` (appuntamento ${lead.dataAppuntamento} ${lead.oraAppuntamento})`);
                    await (0, gmail_1.sendFeedbackRequestToMedico)(lead);
                }
            }
        }
        catch (err) {
            console.error(`[${ora()}] ❌ Errore su lead pipeline ${lead.telefono}:`, err);
        }
    }
    console.log(`[${ora()}] ✔ Ciclo lead manager completato`);
}
// ──────────────────────────────────────────────────────────────
// WEBHOOK HANDLER  (POST /webhook/vapi)
// ──────────────────────────────────────────────────────────────
async function handleVapiWebhook(body) {
    // Il numero di telefono è sempre nel body, indipendentemente dal tipo di evento
    const telefono = body?.message?.call?.customer?.number ?? '';
    const result = await (0, vapi_1.parseCallResult)(body);
    if (!result) {
        const tipo = body?.message?.type ?? 'sconosciuto';
        console.log(`[${ora()}] ℹ️  Webhook VAPI ignorato (tipo: "${tipo}")`);
        return;
    }
    const { status, note, dataAppuntamento, oraAppuntamento, giorniRicontatto } = result;
    console.log(`[${ora()}] 🪝 Webhook VAPI — telefono: ${telefono}, esito: "${status}"`);
    if (!telefono) {
        console.warn(`[${ora()}] ⚠️  Webhook senza numero di telefono, ignorato`);
        return;
    }
    switch (status) {
        case 'qualificato': {
            if (dataAppuntamento && oraAppuntamento) {
                // Ha già data e ora → crea evento su Google Calendar
                const pipeline = await (0, googleSheets_1.getPipelineLeads)();
                const base = pipeline.find((l) => l.telefono === telefono);
                if (!base)
                    throw new Error(`Lead non trovato in pipeline: ${telefono}`);
                const fullLead = { ...base, dataAppuntamento, oraAppuntamento };
                const eventId = await (0, googleCalendar_1.createAppointment)(fullLead);
                console.log(`[${ora()}] 📆 Appuntamento creato (eventId: ${eventId}) per ${telefono}`);
                await (0, googleSheets_1.updatePipelineRow)(telefono, {
                    status: statuses_1.STATUSES.APPUNTAMENTO_FISSATO,
                    dataAppuntamento,
                    oraAppuntamento,
                    noteChiamata: note,
                });
            }
            else {
                // Qualificato senza slot → richiama tra 2h per fissare
                await (0, googleSheets_1.updatePipelineRow)(telefono, {
                    status: statuses_1.STATUSES.SCHEDULED_CALL,
                    prossimaTentativo: aggiungiOre(2),
                    noteChiamata: note,
                });
                console.log(`[${ora()}] 📋 Qualificato senza slot — richiamo tra 2h: ${telefono}`);
            }
            break;
        }
        case 'richiamami': {
            await (0, googleSheets_1.updatePipelineRow)(telefono, {
                status: statuses_1.STATUSES.SCHEDULED_CALL,
                prossimaTentativo: aggiungiOre(24),
                noteChiamata: note,
            });
            console.log(`[${ora()}] ⏰ Richiamo richiesto da ${telefono} — schedulato tra 24h`);
            break;
        }
        case 'da_ricontattare': {
            const giorni = giorniRicontatto ?? 7;
            const quando = aggiungiOre(giorni * 24);
            await (0, googleSheets_1.updatePipelineRow)(telefono, {
                status: statuses_1.STATUSES.DA_RICONTATTARE,
                prossimaTentativo: quando,
                noteChiamata: note,
            });
            console.log(`[${ora()}] 📌 Da ricontattare: ${telefono} — tra ${giorni} giorni (${quando})`);
            break;
        }
        case 'info_richieste': {
            const pipeline = await (0, googleSheets_1.getPipelineLeads)();
            const lead = pipeline.find((l) => l.telefono === telefono);
            if (!lead)
                throw new Error(`Lead non trovato in pipeline: ${telefono}`);
            const infoLink = process.env.INFO_LINK ?? 'https://predicta.it/info';
            try {
                await (0, twilio_1.sendWhatsApp)(lead, `Ciao ${lead.nome}, ecco le informazioni che hai richiesto: ${infoLink}`);
            }
            catch (e) {
                console.error("WhatsApp error:", e);
            }
            await (0, googleSheets_1.updatePipelineRow)(telefono, {
                status: statuses_1.STATUSES.INFO_INVIATE,
                prossimaTentativo: aggiungiOre(48),
                noteChiamata: note,
            });
            console.log(`[${ora()}] 📨 Info inviate via WhatsApp a ${telefono}`);
            break;
        }
        case 'non_risponde': {
            const pipeline = await (0, googleSheets_1.getPipelineLeads)();
            const lead = pipeline.find((l) => l.telefono === telefono);
            const tentativiAggiornati = (lead?.tentativiChiamata ?? 0) + 1;
            await (0, googleSheets_1.updatePipelineRow)(telefono, {
                status: statuses_1.STATUSES.NON_RISPONDE,
                tentativiChiamata: tentativiAggiornati,
                prossimaTentativo: aggiungiOre(2),
                noteChiamata: note,
            });
            console.log(`[${ora()}] 📵 Non risponde: ${telefono}` +
                ` — tentativo ${tentativiAggiornati}, richiamo tra 2h`);
            break;
        }
        case 'segreteria': {
            const pipeline = await (0, googleSheets_1.getPipelineLeads)();
            const lead = pipeline.find((l) => l.telefono === telefono);
            if (!lead)
                throw new Error(`Lead non trovato in pipeline: ${telefono}`);
            try {
                await (0, twilio_1.sendWhatsApp)(lead, `Ciao ${lead.nome}, ti ho appena chiamato ma non ho trovato risposta. Ti ricontatterò presto!`);
            }
            catch (e) {
                console.error("WhatsApp error:", e);
            }
            await (0, googleSheets_1.updatePipelineRow)(telefono, {
                status: statuses_1.STATUSES.NON_RISPONDE,
                prossimaTentativo: aggiungiOre(24),
                noteChiamata: note,
            });
            console.log(`[${ora()}] 📬 Segreteria → WA inviato a ${telefono}, richiamo tra 24h`);
            break;
        }
        case 'non_interessato': {
            await (0, googleSheets_1.updatePipelineRow)(telefono, {
                status: statuses_1.STATUSES.NON_INTERESSATO,
                noteChiamata: note,
            });
            console.log(`[${ora()}] 🚫 Non interessato: ${telefono}`);
            break;
        }
        case 'numero_errato': {
            await (0, googleSheets_1.updatePipelineRow)(telefono, {
                status: statuses_1.STATUSES.NUMERO_ERRATO,
                noteChiamata: note,
            });
            console.log(`[${ora()}] ❌ Numero errato: ${telefono}`);
            break;
        }
        case 'ostile': {
            await (0, googleSheets_1.updatePipelineRow)(telefono, {
                status: statuses_1.STATUSES.SCHEDULED_CALL,
                prossimaTentativo: aggiungiOre(24),
                noteChiamata: 'Lead ostile al primo contatto',
            });
            console.log(`[${ora()}] 😤 Lead ostile: ${telefono} — richiamo tra 24h`);
            break;
        }
        case 'gia_cliente': {
            await (0, googleSheets_1.updatePipelineRow)(telefono, {
                status: statuses_1.STATUSES.GIA_CLIENTE,
                noteChiamata: note,
            });
            console.log(`[${ora()}] ✨ Già cliente: ${telefono}`);
            break;
        }
        default:
            console.warn(`[${ora()}] ⚠️  Esito sconosciuto "${status}" per ${telefono} — ignorato`);
    }
}
// ──────────────────────────────────────────────────────────────
// FEEDBACK HANDLER  (ogni 60 minuti)
// ──────────────────────────────────────────────────────────────
async function runFeedbackHandler() {
    console.log(`[${ora()}] 📩 Controllo risposte feedback dal medico...`);
    let risposte;
    try {
        risposte = await (0, gmail_1.readFeedbackReplies)();
    }
    catch (err) {
        console.error(`[${ora()}] ❌ Errore lettura feedback Gmail:`, err);
        return;
    }
    if (risposte.length === 0) {
        console.log(`[${ora()}] Nessuna risposta feedback trovata`);
        return;
    }
    console.log(`[${ora()}] Risposte feedback trovate: ${risposte.length}`);
    for (const { leadId, feedback } of risposte) {
        try {
            const fb = feedback.toLowerCase();
            const noShow = fb.includes('non si è presentato') ||
                fb.includes('no show') ||
                fb.includes('non è venuto') ||
                fb.includes('assente');
            const nuovoStatus = noShow
                ? statuses_1.STATUSES.NO_SHOW
                : statuses_1.STATUSES.APPUNTAMENTO_COMPLETATO;
            // leadId è il telefono del paziente (usato come chiave di ricerca)
            await (0, googleSheets_1.updatePipelineRow)(leadId, {
                feedbackMedico: feedback,
                status: nuovoStatus,
            });
            console.log(`[${ora()}] 📋 Feedback registrato per ${leadId}: ${nuovoStatus}`);
        }
        catch (err) {
            console.error(`[${ora()}] ❌ Errore registrazione feedback per ${leadId}:`, err);
        }
    }
}
//# sourceMappingURL=leadManager.js.map