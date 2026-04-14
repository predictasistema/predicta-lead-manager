import axios from 'axios';
import { Lead } from '../types/lead';

const VAPI_API_URL = 'https://api.vapi.ai';

// ──────────────────────────────────────────────────────────────
// Esiti intermedi della chiamata (diversi da LeadStatus)
// ──────────────────────────────────────────────────────────────

export type CallOutcome =
  | 'qualificato'
  | 'richiamami'
  | 'da_ricontattare'
  | 'info_richieste'
  | 'gia_cliente'
  | 'non_interessato'
  | 'numero_errato'
  | 'non_risponde'
  | 'ostile'
  | 'segreteria';

export interface ParsedCallOutcome {
  status: CallOutcome;
  note: string;
  dataAppuntamento?: string;   // YYYY-MM-DD
  oraAppuntamento?: string;    // HH:MM
  giorniRicontatto?: number;   // per da_ricontattare — giorni da aggiungere a oggi
}

// ──────────────────────────────────────────────────────────────
// startCall — avvia una chiamata outbound VAPI
// ──────────────────────────────────────────────────────────────

export async function startCall(lead: Lead): Promise<string> {
  const response = await axios.post(
    `${VAPI_API_URL}/call/phone`,
    {
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      assistantId: process.env.VAPI_ASSISTANT_ID,
      customer: {
        number: lead.telefono,
        name: `${lead.nome} ${lead.cognome}`,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    },
  );

  const callId = response.data?.id as string | undefined;
  if (!callId) throw new Error('VAPI non ha restituito un callId');
  return callId;
}

// ──────────────────────────────────────────────────────────────
// Helpers — estrazione data/ora e giorni da testo italiano
// ──────────────────────────────────────────────────────────────

const MESI_IT: Record<string, number> = {
  gennaio: 1,   febbraio: 2,  marzo: 3,     aprile: 4,
  maggio: 5,    giugno: 6,    luglio: 7,    agosto: 8,
  settembre: 9, ottobre: 10,  novembre: 11, dicembre: 12,
};

const NUMERI_IT: Record<string, number> = {
  un: 1, uno: 1, una: 1,
  due: 2, tre: 3, quattro: 4, cinque: 5,
  sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
};

/**
 * Cerca nel testo una data (italiana o numerica) e un'ora.
 * Restituisce { data: 'YYYY-MM-DD', ora: 'HH:MM' } oppure null.
 */
function extractDateAndTime(text: string): { data: string; ora: string } | null {
  let day: number | null = null;
  let month: number | null = null;
  let year = new Date().getFullYear();

  // "15 marzo [2024]" / "il 15 marzo"
  const wordDate = text.match(
    /\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(\d{4}))?\b/i,
  );
  if (wordDate) {
    day = parseInt(wordDate[1], 10);
    month = MESI_IT[wordDate[2].toLowerCase()] ?? null;
    if (wordDate[3]) year = parseInt(wordDate[3], 10);
  }

  // "15/03[/2024]" or "15-03[-2024]"
  if (!day) {
    const numDate = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}|\d{2}))?\b/);
    if (numDate) {
      day = parseInt(numDate[1], 10);
      month = parseInt(numDate[2], 10);
      if (numDate[3]) {
        const y = parseInt(numDate[3], 10);
        year = y < 100 ? 2000 + y : y;
      }
    }
  }

  if (day === null || month === null) return null;

  // Avanza l'anno se la data è già passata
  const candidate = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  if (candidate < new Date()) year += 1;

  const data = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // "alle 10:30" / "alle 10" / "ore 10:30" / "ore 10"
  const timeMatch = text.match(/(?:alle|ore)\s+(\d{1,2})(?::(\d{2}))?/i);
  const ora = timeMatch
    ? `${String(parseInt(timeMatch[1], 10)).padStart(2, '0')}:${timeMatch[2] ?? '00'}`
    : '09:00';

  return { data, ora };
}

/**
 * Estrae i giorni da frasi come "tra 3 giorni", "tra due settimane", "tra un mese".
 * Default: 7 giorni.
 */
function extractDays(text: string): number {
  const match = text.match(
    /tra\s+(\d+|un[oa]?|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\s+(giorn[oi]|settiman[ae]|mes[ei])/i,
  );
  if (!match) return 7;
  const rawNum = match[1].toLowerCase();
  const n = NUMERI_IT[rawNum] ?? parseInt(rawNum, 10);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('sett')) return n * 7;
  if (unit.startsWith('mes')) return n * 30;
  return n;
}

// ──────────────────────────────────────────────────────────────
// parseCallResult — analisi del webhook VAPI end-of-call-report
// ──────────────────────────────────────────────────────────────

export async function parseCallResult(webhookBody: any): Promise<ParsedCallOutcome | null> {
  const msg = webhookBody?.message;

  // Ignora tutti gli eventi che non sono end-of-call-report
  if (msg?.type !== 'end-of-call-report') return null;

  const rawTranscript: string = msg?.message?.transcript ?? msg?.transcript ?? '';
  const transcript = rawTranscript.toLowerCase();
  const endedReason: string = (msg?.message?.endedReason ?? msg?.endedReason ?? '').toLowerCase();
  const note = (msg?.analysis?.summary ?? rawTranscript.slice(0, 150)).slice(0, 200);

  // ── Segreteria / voicemail ───────────────────────────────────
  if (endedReason === 'voicemail') {
    return { status: 'segreteria', note };
  }

  // ── Nessun transcript → non risponde ────────────────────────
  if (!transcript.trim()) {
    return { status: 'non_risponde', note };
  }

  // ── Non interessato ──────────────────────────────────────────
  if (
    /non\s+mi\s+interessa|non\s+sono\s+interessat[oa]|toglietemi|toglimi\s+da/.test(transcript)
  ) {
    return { status: 'non_interessato', note };
  }

  // ── Numero errato ────────────────────────────────────────────
  if (
    /numero\s+(sbagliato|errato|non\s+esiste)|non\s+è\s+il\s+mio\s+numero|persona\s+(sbagliata|diversa)/.test(transcript)
  ) {
    return { status: 'numero_errato', note };
  }

  // ── Già cliente ──────────────────────────────────────────────
  if (/ho\s+già\s+(un[ao]?\s+)?(medico|dottore|dottoressa|specialista)/.test(transcript)) {
    return { status: 'gia_cliente', note };
  }

  // ── Ostile ───────────────────────────────────────────────────
  if (
    /non\s+rompere|lasciami\s+in\s+pace|smettil[ae]\s+di\s+chiama|non\s+chiama\w*\s+più|vaffanculo|basta\s+chiamare/.test(transcript)
  ) {
    return { status: 'ostile', note };
  }

  // ── Informazioni richieste ───────────────────────────────────
  if (
    /mandami|mandatemi|inviatemi|informatemi|informazioni|materiale|brochure|dépliant|link|sito/.test(transcript)
  ) {
    return { status: 'info_richieste', note };
  }

  // ── Da ricontattare (tra N giorni/settimane/mesi) ────────────
  if (
    /tra\s+(\d+|un[oa]?|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\s+(giorn[oi]|settiman[ae]|mes[ei])/.test(transcript)
  ) {
    const giorni = extractDays(transcript);
    return { status: 'da_ricontattare', note, giorniRicontatto: giorni };
  }

  // ── Richiamami / richiamatemi ────────────────────────────────
  if (/richiamami|richiamatemi|chiamami\s+(dopo|più\s+tardi|domani)|risentiti/.test(transcript)) {
    return { status: 'richiamami', note };
  }

  // ── Appuntamento fissato ─────────────────────────────────────
  if (/appuntamento|prenoto|prenotare|fissare|fissato|visita/.test(transcript)) {
    const dateResult = extractDateAndTime(transcript);
    if (dateResult) {
      return {
        status: 'qualificato',
        note,
        dataAppuntamento: dateResult.data,
        oraAppuntamento: dateResult.ora,
      };
    }
    // Menziona appuntamento ma nessuna data riconoscibile → qualificato senza slot
    return { status: 'qualificato', note };
  }

  // ── Default ──────────────────────────────────────────────────
  return { status: 'non_risponde', note };
}
