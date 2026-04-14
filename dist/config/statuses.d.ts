export declare const STATUSES: {
    readonly NUOVO: "nuovo";
    readonly IN_CHIAMATA: "in_chiamata";
    readonly NON_RISPONDE: "non_risponde";
    readonly DA_RICONTATTARE: "da_ricontattare";
    readonly SEGRETERIA: "segreteria";
    readonly INFO_INVIATE: "info_inviate";
    readonly QUALIFICATO: "qualificato";
    readonly APPUNTAMENTO_FISSATO: "appuntamento_fissato";
    readonly APPUNTAMENTO_COMPLETATO: "appuntamento_completato";
    readonly NO_SHOW: "no_show";
    readonly NON_INTERESSATO: "non_interessato";
    readonly NUMERO_ERRATO: "numero_errato";
    readonly GIA_CLIENTE: "gia_cliente";
    readonly CONVERTITO: "convertito";
};
export type LeadStatus = (typeof STATUSES)[keyof typeof STATUSES];
//# sourceMappingURL=statuses.d.ts.map