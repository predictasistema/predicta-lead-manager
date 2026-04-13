"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendFeedbackRequestToMedico = sendFeedbackRequestToMedico;
exports.readFeedbackReplies = readFeedbackReplies;
const nodemailer_1 = __importDefault(require("nodemailer"));
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});
async function sendFeedbackRequestToMedico(lead) {
    await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.MEDICO_EMAIL,
        subject: `Feedback appuntamento - ${lead.nome} ${lead.cognome}`,
        text: `Gentile dottore,\n\nIl paziente ${lead.nome} ${lead.cognome} (${lead.telefono}) aveva un appuntamento.\n\nSi è presentato? Risponda a questa email con:\n- "si presentato" se è venuto\n- "no show" se non si è presentato\n\nGrazie,\nSistema Predicta`,
    });
}
async function readFeedbackReplies() {
    // Per ora restituisce array vuoto - da implementare con IMAP se necessario
    return [];
}
//# sourceMappingURL=gmail.js.map