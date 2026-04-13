import 'dotenv/config';

import * as cron from 'node-cron';
import express, { Request, Response } from 'express';
import {
  runLeadManagerCycle,
  handleVapiWebhook,
  runFeedbackHandler,
} from './agents/leadManager';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const intervalMinutes = parseInt(process.env.CHECK_INTERVAL_MINUTES ?? '5', 10);

function ora(): string {
  return new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
}

// ──────────────────────────────────────────────────────────────
// Express — server webhook
// ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/webhook/vapi', async (req: Request, res: Response) => {
  console.log('📨 Webhook ricevuto:', JSON.stringify(req.body, null, 2).slice(0, 500));
  console.log(`[${ora()}] 📥 Webhook VAPI ricevuto`);
  try {
    await handleVapiWebhook(req.body);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[${ora()}] ❌ Errore nel webhook VAPI:`, err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`[${ora()}] 🚀 Server Express in ascolto sulla porta ${PORT}`);
});

// ──────────────────────────────────────────────────────────────
// Keepalive — ping ogni 4 minuti per tenere sveglio il Codespace
// ──────────────────────────────────────────────────────────────

setInterval(async () => {
  try {
    await fetch(`${process.env.WEBHOOK_URL}/health`);
    console.log(`[${new Date().toLocaleString('it-IT')}] 💓 Keepalive ping`);
  } catch (_e) {}
}, 4 * 60 * 1000);

// ──────────────────────────────────────────────────────────────
// Cron — ciclo principale (ogni CHECK_INTERVAL_MINUTES)
// ──────────────────────────────────────────────────────────────

console.log(`[${ora()}] ▶ Avvio predicta-lead-manager — ciclo ogni ${intervalMinutes} minuti`);
console.log(`🔗 Webhook URL: ${process.env.WEBHOOK_URL}/webhook/vapi`);

cron.schedule(`*/${intervalMinutes} * * * *`, async () => {
  console.log(`[${ora()}] ⏱  Esecuzione ciclo lead manager...`);
  try {
    await runLeadManagerCycle();
  } catch (err) {
    console.error(`[${ora()}] ❌ Errore nel ciclo lead manager:`, err);
  }
});

// ──────────────────────────────────────────────────────────────
// Cron — feedback handler (ogni 60 minuti)
// ──────────────────────────────────────────────────────────────

cron.schedule('0 * * * *', async () => {
  console.log(`[${ora()}] ⏱  Esecuzione controllo feedback medico...`);
  try {
    await runFeedbackHandler();
  } catch (err) {
    console.error(`[${ora()}] ❌ Errore nel feedback handler:`, err);
  }
});
