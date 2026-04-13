export declare const STATUSES: {
    readonly NUOVO: "nuovo";
    readonly IN_CHIAMATA: "in_chiamata";
    readonly APPUNTAMENTO_FISSATO: "appuntamento_fissato";
    readonly DA_RICONTATTARE: "da_ricontattare";
    readonly SCHEDULED_CALL: "scheduled_call";
    readonly INFO_INVIATE: "info_inviate";
    readonly NON_RISPONDE: "non_risponde";
    readonly NON_INTERESSATO: "non_interessato";
    readonly NUMERO_ERRATO: "numero_errato";
    readonly GIA_CLIENTE: "gia_cliente";
    readonly APPUNTAMENTO_COMPLETATO: "appuntamento_completato";
    readonly NO_SHOW: "no_show";
};
export type LeadStatus = (typeof STATUSES)[keyof typeof STATUSES];
//# sourceMappingURL=statuses.d.ts.map