"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsApp = sendWhatsApp;
exports.sendWhatsAppToMedico = sendWhatsAppToMedico;
const twilio_1 = __importDefault(require("twilio"));
const client = (0, twilio_1.default)(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
async function sendWhatsApp(lead, message) {
    const result = await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${lead.telefono}`,
        body: message,
    });
    return result.sid;
}
async function sendWhatsAppToMedico(message) {
    const result = await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${process.env.MEDICO_WHATSAPP}`,
        body: message,
    });
    return result.sid;
}
//# sourceMappingURL=twilio.js.map