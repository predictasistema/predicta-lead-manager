import { Lead } from '../types/lead';
export declare function getLeads(): Promise<Lead[]>;
export declare function updateLead(telefono: string, updates: Partial<Lead>): Promise<void>;
export declare function getPipelineLeads(): Promise<Lead[]>;
export declare function updatePipelineRow(telefono: string, updates: any): Promise<void>;
//# sourceMappingURL=googleSheets.d.ts.map