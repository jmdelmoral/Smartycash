/**
 * Códigos de tipo de documento de cobranza, PARAMETRIZABLES por país.
 *
 * Cada documento tiene:
 *   - `typeCode`: el código fiscal/interno (ej. Chile: 33 afecta, 34 exenta, 61 NC).
 *   - `type` (categoría): Factura / Nota de cobro / Nota de Crédito, que se DERIVA
 *     del código vía este mapa. La categoría mantiene la lógica existente (p. ej.
 *     detectar Notas de Crédito como fuente de pago).
 *
 * La identidad del documento es País + Código + Número.
 *
 * Para agregar países/códigos nuevos (Colombia, etc.), edita este mapa.
 */
export type DocCategory = 'Factura' | 'Nota de cobro' | 'Nota de Crédito';

export type DocTypeDef = { code: string; label: string; category: DocCategory };

export const DOCUMENT_TYPE_CODES: Record<string, DocTypeDef[]> = {
  Chile: [
    { code: '33', label: 'Factura afecta', category: 'Factura' },
    { code: '34', label: 'Factura exenta', category: 'Factura' },
    { code: '61', label: 'Nota de crédito', category: 'Nota de Crédito' },
    { code: 'NC', label: 'Nota de cobro', category: 'Nota de cobro' },
  ],
  // Colombia: agrega aquí sus códigos (DIAN) cuando aparezcan.
  // Colombia: [ ... ],
};

/** Lista de tipos disponibles para un país (fallback a Chile si el país no está). */
export function listDocTypes(country: string | undefined): DocTypeDef[] {
  if (country && DOCUMENT_TYPE_CODES[country]) return DOCUMENT_TYPE_CODES[country];
  return DOCUMENT_TYPE_CODES['Chile'] ?? [];
}

/** Busca la definición de un código en un país (case-insensitive). */
export function getDocType(country: string | undefined, code: string): DocTypeDef | undefined {
  const wanted = String(code).trim().toUpperCase();
  // Busca primero en el país; si no, en cualquier país (compatibilidad).
  const inCountry = (country && DOCUMENT_TYPE_CODES[country]) || [];
  const all = Object.values(DOCUMENT_TYPE_CODES).flat();
  return (
    inCountry.find((d) => d.code.toUpperCase() === wanted) ??
    all.find((d) => d.code.toUpperCase() === wanted)
  );
}

/** Categoría (Factura/Nota de cobro/Nota de Crédito) derivada del código. */
export function docCategory(country: string | undefined, code: string): DocCategory {
  return getDocType(country, code)?.category ?? 'Factura';
}

/** Etiqueta legible "Etiqueta (código)"; si no está en config, muestra el código tal cual. */
export function docLabel(country: string | undefined, code: string): string {
  const def = getDocType(country, code);
  return def ? `${def.label} (${def.code})` : String(code);
}
