export const STATUSES = {
  NUOVO: 'nuovo',
  IN_CHIAMATA: 'in_chiamata',
  NON_RISPONDE: 'non_risponde',
  DA_RICONTATTARE: 'da_ricontattare',
  SEGRETERIA: 'segreteria',
  INFO_INVIATE: 'info_inviate',
  QUALIFICATO: 'qualificato',
  APPUNTAMENTO_FISSATO: 'appuntamento_fissato',
  APPUNTAMENTO_COMPLETATO: 'appuntamento_completato',
  NO_SHOW: 'no_show',
  NON_INTERESSATO: 'non_interessato',
  NUMERO_ERRATO: 'numero_errato',
  GIA_CLIENTE: 'gia_cliente',
  CONVERTITO: 'convertito',
  HA_ATTACCATO: 'ha_attaccato',
} as const;

export type LeadStatus = (typeof STATUSES)[keyof typeof STATUSES];
