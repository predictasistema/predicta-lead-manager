"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const cron = __importStar(require("node-cron"));
const express_1 = __importDefault(require("express"));
const leadManager_1 = require("./agents/leadManager");
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const intervalMinutes = parseInt(process.env.CHECK_INTERVAL_MINUTES ?? '5', 10);
function ora() {
    return new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
}
// ──────────────────────────────────────────────────────────────
// Express — server webhook
// ──────────────────────────────────────────────────────────────
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.post('/webhook/vapi', async (req, res) => {
    console.log('📨 Webhook ricevuto:', JSON.stringify(req.body, null, 2).slice(0, 500));
    console.log(`[${ora()}] 📥 Webhook VAPI ricevuto`);
    try {
        await (0, leadManager_1.handleVapiWebhook)(req.body);
        res.status(200).json({ ok: true });
    }
    catch (err) {
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
    }
    catch (_e) { }
}, 4 * 60 * 1000);
// ──────────────────────────────────────────────────────────────
// Cron — ciclo principale (ogni CHECK_INTERVAL_MINUTES)
// ──────────────────────────────────────────────────────────────
console.log(`[${ora()}] ▶ Avvio predicta-lead-manager — ciclo ogni ${intervalMinutes} minuti`);
console.log(`🔗 Webhook URL: ${process.env.WEBHOOK_URL}/webhook/vapi`);
cron.schedule(`*/${intervalMinutes} * * * *`, async () => {
    console.log(`[${ora()}] ⏱  Esecuzione ciclo lead manager...`);
    try {
        await (0, leadManager_1.runLeadManagerCycle)();
    }
    catch (err) {
        console.error(`[${ora()}] ❌ Errore nel ciclo lead manager:`, err);
    }
});
// ──────────────────────────────────────────────────────────────
// Cron — feedback handler (ogni 60 minuti)
// ──────────────────────────────────────────────────────────────
cron.schedule('0 * * * *', async () => {
    console.log(`[${ora()}] ⏱  Esecuzione controllo feedback medico...`);
    try {
        await (0, leadManager_1.runFeedbackHandler)();
    }
    catch (err) {
        console.error(`[${ora()}] ❌ Errore nel feedback handler:`, err);
    }
});
//# sourceMappingURL=index.js.map