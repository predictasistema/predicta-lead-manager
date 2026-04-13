import { Lead } from '../types/lead';
export type CallOutcome = 'qualificato' | 'richiamami' | 'da_ricontattare' | 'info_richieste' | 'gia_cliente' | 'non_interessato' | 'numero_errato' | 'non_risponde' | 'ostile' | 'segreteria';
export interface ParsedCallOutcome {
    status: CallOutcome;
    note: string;
    dataAppuntamento?: string;
    oraAppuntamento?: string;
    giorniRicontatto?: number;
}
export declare function startCall(lead: Lead): Promise<string>;
export declare function parseCallResult(webhookBody: any): Promise<ParsedCallOutcome | null>;
//# sourceMappingURL=vapi.d.ts.map