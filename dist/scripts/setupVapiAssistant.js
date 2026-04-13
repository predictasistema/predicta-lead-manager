"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const axios_1 = __importDefault(require("axios"));
const ASSISTANT_ID = 'f4913603-2971-4ca6-ab81-b0cc07f0e31a';
const SYSTEM_PROMPT = `Sei Sofia, assistente virtuale di uno studio di medicina estetica italiano.
Il tuo obiettivo è qualificare il lead e fissare un appuntamento.
Parli sempre in italiano, con tono caldo e professionale.
Non sei mai aggressiva. Ascolti il lead e rispondi alle sue preoccupazioni.

REGOLE:
- Se il lead vuole essere richiamato → conferma orario e saluta
- Se chiede il prezzo → dì che dipende dalla valutazione del medico, offri visita gratuita
- Se ha già un medico → valorizza una seconda opinione gratuita
- Se non è interessato → ringrazia e saluta con rispetto
- Se vuole informazioni scritte → di che gliele mandi subito e richiami domani
- Se fissa appuntamento → conferma nome, data e ora prima di salutare

OBIETTIVO PRINCIPALE: fissare una visita conoscitiva gratuita.`;
async function main() {
    const apiKey = process.env.VAPI_API_KEY;
    if (!apiKey)
        throw new Error('VAPI_API_KEY non configurato nel .env');
    const response = await axios_1.default.patch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
        transcriber: {
            provider: 'deepgram',
            model: 'nova-2-general',
            language: 'it',
            smartFormat: true,
        },
        model: {
            temperature: 0.7,
        },
        voice: {
            provider: 'azure',
            voiceId: 'it-IT-IsabellaNeural',
        },
        silenceTimeoutSeconds: 30,
        serverUrl: `${process.env.WEBHOOK_URL}/webhook/vapi`,
    }, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });
    console.log('✓ Assistant aggiornato con successo');
    console.log(`  ID: ${response.data?.id ?? ASSISTANT_ID}`);
}
main().catch((err) => {
    console.error("Errore durante l'aggiornamento dell'assistant:", err?.response?.data ?? err);
    process.exit(1);
});
//# sourceMappingURL=setupVapiAssistant.js.map