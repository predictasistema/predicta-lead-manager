import { Lead } from '../types/lead';
import { STATUSES } from '../config/statuses';
import {
  getNewLeads,
  appendToPipeline,
  updateLeadStatus,
  updatePipelineRow,
  getPipelineLeads,
} from '../integrations/googleSheets';
import { startCall, parseCallResult } from '../integrations/vapi';
import { createAppointment } from '../integrations/googleCalendar';
import { sendFeedbackRequestToMedico, readFeedbackReplies } from '../integrations/gmail';
import { sendWhatsApp } from '../integrations/twilio';

// ──────────────────────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────────────────────

function ora(): string {
  return new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
}

function aggiungiOre(n: number): string {
  return new Date(Date.now() + n * 60 * 60 * 1000).toISOString();
}

function isPast(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) <= new Date();
}

// ──────────────────────────────────────────────────────────────
// CICLO PRINCIPALE
// ──────────────────────────────────────────────────────────────

export async function runLeadManagerCycle(): Promise<void> {
  console.log(`[${ora()}] ▶ Inizio ciclo lead manager`);

  // ── 1. Nuovi lead (status "nuovo" nel foglio leads) ──────────

  const nuoviLead = await getNewLeads();
  console.log(`[${ora()}] Nuovi lead trovati: ${nuoviLead.length}`);

  for (const lead of nuoviLead) {
    try {
      console.log(`[${ora()}] 📞 Nuovo lead: ${lead.nome} ${lead.cognome} (${lead.telefono})`);
      await updateLeadStatus(lead.rowIndex, STATUSES.IN_CHIAMATA);
      await appendToPipeline({ ...lead, status: STATUSES.IN_CHIAMATA });
      const callId = await startCall(lead);
      console.log(`[${ora()}] ✅ Chiamata avviata per ${lead.nome} ${lead.cognome} (callId: ${callId})`);
    } catch (err) {
      console.error(`[${ora()}] ❌ Errore su nuovo lead ${lead.telefono}:`, err);
    }
  }

  // ── 2. Lead in pipeline con altri status ─────────────────────

  const pipeline = await getPipelineLeads();

  for (const lead of pipeline) {
    try {
      // non_risponde: richiama o manda WA finale
      if (lead.status === STATUSES.NON_RISPONDE && isPast(lead.prossimaTentativo)) {
        if (lead.tentativiChiamata < 3) {
          console.log(
            `[${ora()}] 🔁 Richiamo non_risponde: ${lead.nome} ${lead.cognome}` +
            ` (tentativo ${lead.tentativiChiamata + 1}/3)`,
          );
          await startCall(lead);
        } else {
          console.log(
            `[${ora()}] 📱 Tentativi esauriti — WA finale a ${lead.nome} ${lead.cognome}`,
          );
          await sendWhatsApp(
            lead,
            `Ciao ${lead.nome}, abbiamo cercato di contattarti più volte senza successo. ` +
            `Se in futuro fossi interessato, siamo a tua disposizione.`,
          );
          await updatePipelineRow(lead.telefono, { status: STATUSES.NON_INTERESSATO });
        }
        continue;
      }

      // scheduled_call scaduto
      if (lead.status === STATUSES.SCHEDULED_CALL && isPast(lead.prossimaTentativo)) {
        console.log(`[${ora()}] 📅 Richiamo scheduled_call: ${lead.nome} ${lead.cognome}`);
        await startCall(lead);
        continue;
      }

      // da_ricontattare scaduto
      if (lead.status === STATUSES.DA_RICONTATTARE && isPast(lead.prossimaTentativo)) {
        console.log(`[${ora()}] 🔄 Richiamo da_ricontattare: ${lead.nome} ${lead.cognome}`);
        await startCall(lead);
        continue;
      }

      // appuntamento_fissato nel passato → richiedi feedback al medico
      if (lead.status === STATUSES.APPUNTAMENTO_FISSATO) {
        const passato =
          lead.dataAppuntamento && lead.oraAppuntamento
            ? isPast(`${lead.dataAppuntamento}T${lead.oraAppuntamento}:00`)
            : false;
        if (passato) {
          console.log(
            `[${ora()}] 📧 Richiesta feedback per ${lead.nome} ${lead.cognome}` +
            ` (appuntamento ${lead.dataAppuntamento} ${lead.oraAppuntamento})`,
          );
          await sendFeedbackRequestToMedico(lead);
        }
      }
    } catch (err) {
      console.error(`[${ora()}] ❌ Errore su lead pipeline ${lead.telefono}:`, err);
    }
  }

  console.log(`[${ora()}] ✔ Ciclo lead manager completato`);
}

// ──────────────────────────────────────────────────────────────
// WEBHOOK HANDLER  (POST /webhook/vapi)
// ──────────────────────────────────────────────────────────────

export async function handleVapiWebhook(body: any): Promise<void> {
  // Il numero di telefono è sempre nel body, indipendentemente dal tipo di evento
  const telefono: string = body?.message?.call?.customer?.number ?? '';

  const result = await parseCallResult(body);

  if (!result) {
    const tipo: string = body?.message?.type ?? 'sconosciuto';
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
        const pipeline = await getPipelineLeads();
        const base = pipeline.find((l) => l.telefono === telefono);
        if (!base) throw new Error(`Lead non trovato in pipeline: ${telefono}`);
        const fullLead: Lead = { ...base, dataAppuntamento, oraAppuntamento };
        const eventId = await createAppointment(fullLead);
        console.log(`[${ora()}] 📆 Appuntamento creato (eventId: ${eventId}) per ${telefono}`);
        await updatePipelineRow(telefono, {
          status: STATUSES.APPUNTAMENTO_FISSATO,
          dataAppuntamento,
          oraAppuntamento,
          noteChiamata: note,
        });
      } else {
        // Qualificato senza slot → richiama tra 2h per fissare
        await updatePipelineRow(telefono, {
          status: STATUSES.SCHEDULED_CALL,
          prossimaTentativo: aggiungiOre(2),
          noteChiamata: note,
        });
        console.log(`[${ora()}] 📋 Qualificato senza slot — richiamo tra 2h: ${telefono}`);
      }
      break;
    }

    case 'richiamami': {
      await updatePipelineRow(telefono, {
        status: STATUSES.SCHEDULED_CALL,
        prossimaTentativo: aggiungiOre(24),
        noteChiamata: note,
      });
      console.log(`[${ora()}] ⏰ Richiamo richiesto da ${telefono} — schedulato tra 24h`);
      break;
    }

    case 'da_ricontattare': {
      const giorni = giorniRicontatto ?? 7;
      const quando = aggiungiOre(giorni * 24);
      await updatePipelineRow(telefono, {
        status: STATUSES.DA_RICONTATTARE,
        prossimaTentativo: quando,
        noteChiamata: note,
      });
      console.log(`[${ora()}] 📌 Da ricontattare: ${telefono} — tra ${giorni} giorni (${quando})`);
      break;
    }

    case 'info_richieste': {
      const pipeline = await getPipelineLeads();
      const lead = pipeline.find((l) => l.telefono === telefono);
      if (!lead) throw new Error(`Lead non trovato in pipeline: ${telefono}`);
      const infoLink = process.env.INFO_LINK ?? 'https://predicta.it/info';
      await sendWhatsApp(
        lead,
        `Ciao ${lead.nome}, ecco le informazioni che hai richiesto: ${infoLink}`,
      );
      await updatePipelineRow(telefono, {
        status: STATUSES.INFO_INVIATE,
        prossimaTentativo: aggiungiOre(48),
        noteChiamata: note,
      });
      console.log(`[${ora()}] 📨 Info inviate via WhatsApp a ${telefono}`);
      break;
    }

    case 'non_risponde': {
      const pipeline = await getPipelineLeads();
      const lead = pipeline.find((l) => l.telefono === telefono);
      const tentativiAggiornati = (lead?.tentativiChiamata ?? 0) + 1;
      await updatePipelineRow(telefono, {
        status: STATUSES.NON_RISPONDE,
        tentativiChiamata: tentativiAggiornati,
        prossimaTentativo: aggiungiOre(2),
        noteChiamata: note,
      });
      console.log(
        `[${ora()}] 📵 Non risponde: ${telefono}` +
        ` — tentativo ${tentativiAggiornati}, richiamo tra 2h`,
      );
      break;
    }

    case 'segreteria': {
      const pipeline = await getPipelineLeads();
      const lead = pipeline.find((l) => l.telefono === telefono);
      if (!lead) throw new Error(`Lead non trovato in pipeline: ${telefono}`);
      await sendWhatsApp(
        lead,
        `Ciao ${lead.nome}, ti ho appena chiamato ma non ho trovato risposta. Ti ricontatterò presto!`,
      );
      await updatePipelineRow(telefono, {
        status: STATUSES.NON_RISPONDE,
        prossimaTentativo: aggiungiOre(24),
        noteChiamata: note,
      });
      console.log(`[${ora()}] 📬 Segreteria → WA inviato a ${telefono}, richiamo tra 24h`);
      break;
    }

    case 'non_interessato': {
      await updatePipelineRow(telefono, {
        status: STATUSES.NON_INTERESSATO,
        noteChiamata: note,
      });
      console.log(`[${ora()}] 🚫 Non interessato: ${telefono}`);
      break;
    }

    case 'numero_errato': {
      await updatePipelineRow(telefono, {
        status: STATUSES.NUMERO_ERRATO,
        noteChiamata: note,
      });
      console.log(`[${ora()}] ❌ Numero errato: ${telefono}`);
      break;
    }

    case 'ostile': {
      await updatePipelineRow(telefono, {
        status: STATUSES.SCHEDULED_CALL,
        prossimaTentativo: aggiungiOre(24),
        noteChiamata: 'Lead ostile al primo contatto',
      });
      console.log(`[${ora()}] 😤 Lead ostile: ${telefono} — richiamo tra 24h`);
      break;
    }

    case 'gia_cliente': {
      await updatePipelineRow(telefono, {
        status: STATUSES.GIA_CLIENTE,
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

export async function runFeedbackHandler(): Promise<void> {
  console.log(`[${ora()}] 📩 Controllo risposte feedback dal medico...`);

  let risposte: Array<{ leadId: string; feedback: string }>;
  try {
    risposte = await readFeedbackReplies();
  } catch (err) {
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
      const noShow =
        fb.includes('non si è presentato') ||
        fb.includes('no show') ||
        fb.includes('non è venuto') ||
        fb.includes('assente');

      const nuovoStatus = noShow
        ? STATUSES.NO_SHOW
        : STATUSES.APPUNTAMENTO_COMPLETATO;

      // leadId è il telefono del paziente (usato come chiave di ricerca)
      await updatePipelineRow(leadId, {
        feedbackMedico: feedback,
        status: nuovoStatus,
      });
      console.log(`[${ora()}] 📋 Feedback registrato per ${leadId}: ${nuovoStatus}`);
    } catch (err) {
      console.error(`[${ora()}] ❌ Errore registrazione feedback per ${leadId}:`, err);
    }
  }
}
