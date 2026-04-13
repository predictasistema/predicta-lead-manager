import { Lead } from '../types/lead';
import { LeadStatus } from '../config/statuses';
export declare function getNewLeads(): Promise<Array<Lead & {
    rowIndex: number;
}>>;
export declare function updateLeadStatus(rowIndex: number, status: LeadStatus, extra?: Partial<Lead>): Promise<void>;
export declare function appendToPipeline(lead: Lead): Promise<void>;
export declare function getPipelineLeads(): Promise<Lead[]>;
export declare function updatePipelineRow(telefono: string, fields: Partial<Lead>): Promise<void>;
//# sourceMappingURL=googleSheets.d.ts.map