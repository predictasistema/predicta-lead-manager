export const STATUSES = {
  NUOVO: 'nuovo',
  IN_CHIAMATA: 'in_chiamata',
  APPUNTAMENTO_FISSATO: 'appuntamento_fissato',
  DA_RICONTATTARE: 'da_ricontattare',
  SCHEDULED_CALL: 'scheduled_call',
  INFO_INVIATE: 'info_inviate',
  NON_RISPONDE: 'non_risponde',
  NON_INTERESSATO: 'non_interessato',
  NUMERO_ERRATO: 'numero_errato',
  GIA_CLIENTE: 'gia_cliente',
  APPUNTAMENTO_COMPLETATO: 'appuntamento_completato',
  NO_SHOW: 'no_show',
} as const;

export type LeadStatus = (typeof STATUSES)[keyof typeof STATUSES];
