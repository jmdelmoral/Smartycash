// Lista oficial de países para Clientes y Adquirientes + normalización.
// Se valida en el backend (alta individual y carga masiva) para no aceptar
// texto libre inválido (ej: "Colombiaaa").

export const MASTER_COUNTRIES = [
  'Chile',
  'Perú',
  'Colombia',
  'Argentina',
  'Brasil',
  'México',
  'Estados Unidos',
  'España',
  'China',
] as const;

const strip = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Alias comunes -> canónico.
const ALIASES: Record<string, string> = {
  peru: 'Perú',
  mexico: 'México',
  brazil: 'Brasil',
  usa: 'Estados Unidos',
  eeuu: 'Estados Unidos',
  'ee uu': 'Estados Unidos',
  'estados unidos de america': 'Estados Unidos',
  spain: 'España',
};

const BY_NORM = new Map<string, string>(MASTER_COUNTRIES.map((c) => [strip(c), c]));
for (const [k, v] of Object.entries(ALIASES)) BY_NORM.set(strip(k), v);

/** Devuelve el país canónico si coincide (sin acentos/mayúsculas/alias), o null. */
export function normalizeCountry(input: string | undefined | null): string | null {
  if (!input || !input.trim()) return null;
  return BY_NORM.get(strip(input)) ?? null;
}
