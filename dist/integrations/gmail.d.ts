import { Lead } from '../types/lead';
export declare function sendFeedbackRequestToMedico(lead: Lead): Promise<void>;
export declare function readFeedbackReplies(): Promise<Array<{
    leadId: string;
    feedback: string;
}>>;
//# sourceMappingURL=gmail.d.ts.map