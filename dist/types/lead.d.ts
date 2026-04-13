import { LeadStatus } from '../config/statuses';
export interface Lead {
    id: string;
    nome: string;
    cognome: string;
    telefono: string;
    email: string;
    fonte: string;
    campagna: string;
    dataCompilazione: string;
    status: LeadStatus;
    tentativiChiamata: number;
    prossimaTentativo: string | null;
    dataAppuntamento: string | null;
    oraAppuntamento: string | null;
    noteChiamata: string;
    feedbackMedico: string;
    dataUltimoAggiornamento: string;
}
//# sourceMappingURL=lead.d.ts.map