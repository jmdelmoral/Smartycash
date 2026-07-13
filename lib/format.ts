/**
 * Formato de fecha estándar de la aplicación: dd/mm/yyyy.
 *
 * Internamente el servidor/BD usan ISO (yyyy-mm-dd); este helper es solo para
 * MOSTRAR y EXPORTAR fechas al usuario. Acepta Date, ISO (yyyy-mm-dd o con hora)
 * y strings ya en dd/mm/yyyy (o con guiones), y siempre devuelve dd/mm/yyyy.
 */
export const DATE_FORMAT = 'dd/mm/yyyy';

export function formatDate(value?: string | Date | null): string {
  if (!value) return '';
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim();
  if (!raw) return '';

  // Ya viene dd/mm/yyyy o dd-mm-yyyy
  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(raw);
  if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]}`;

  // ISO: yyyy-mm-dd (con o sin hora)
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;

  return raw; // formato desconocido: se devuelve tal cual
}
