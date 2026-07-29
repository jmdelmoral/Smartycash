/**
 * Código visible (displayId) de un movimiento de cartola.
 * Formato: PAIS(2)-BANCO(3)-CUENTA(4)-YYYYMM-CORRELATIVO(6)
 * Ej: CL-BAN-5678-202606-000123
 * El correlativo es global y único; el periodo (YYYYMM) es informativo.
 */
import type { Prisma } from '@/lib/generated/prisma';
import { parseDateInput } from '@/lib/business-mappers';

function countryPrefix(country: string): string {
  const n = country.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (n === 'cl' || n.includes('chile')) return 'CL';
  if (n === 'pe' || n.includes('per')) return 'PE';
  if (n === 'co' || n.includes('colombia')) return 'CO';
  return n.slice(0, 2).toUpperCase().padEnd(2, 'X');
}

function bankSigla(bank: string): string {
  const letters = bank.toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '');
  return (letters.slice(0, 3) || 'BNK').padEnd(3, 'X');
}

function accountTail(account: string): string {
  const digits = account.replace(/\D/g, '');
  return (digits.slice(-4) || '0000').padStart(4, '0');
}

export function parseDisplaySeq(displayId: string | null | undefined): number {
  if (!displayId) return 0;
  const m = /-(\d{6})$/.exec(displayId);
  return m ? parseInt(m[1], 10) : 0;
}

export function formatMovementDisplayId(input: {
  country: string;
  bank: string;
  account: string;
  date: string;
  seq: number;
}): string {
  const d = parseDateInput(input.date);
  const yyyymm = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${countryPrefix(input.country)}-${bankSigla(input.bank)}-${accountTail(
    input.account
  )}-${yyyymm}-${String(input.seq).padStart(6, '0')}`;
}

/**
 * Genera el siguiente displayId único. Debe llamarse DENTRO de la transacción:
 * las llamadas secuenciales ven las inserciones previas de la misma tx, así el
 * correlativo avanza sin colisiones.
 */
export async function nextMovementDisplayId(
  tx: Prisma.TransactionClient,
  movement: { country: string; bank: string; bankAccount: string; date: string }
): Promise<string> {
  const rows = await tx.cartolaMovement.findMany({
    where: { displayId: { not: null } },
    select: { displayId: true },
  });
  const maxSeq = rows.reduce((m, r) => Math.max(m, parseDisplaySeq(r.displayId)), 0);
  return formatMovementDisplayId({
    country: movement.country,
    bank: movement.bank,
    account: movement.bankAccount,
    date: movement.date,
    seq: maxSeq + 1,
  });
}

/**
 * Asignador de correlativo eficiente para lotes: consulta el máximo actual UNA
 * sola vez y luego incrementa en memoria. Evita escanear toda la tabla por cada
 * movimiento (lo que antes disparaba timeouts de transacción con muchos
 * movimientos y latencia de red). Úsalo una vez por sincronización.
 */
export type DisplayIdAllocator = (movement: {
  country: string;
  bank: string;
  bankAccount: string;
  date: string;
}) => Promise<string>;

export function createDisplayIdAllocator(tx: Prisma.TransactionClient): DisplayIdAllocator {
  let base: number | null = null;
  return async (movement) => {
    if (base === null) {
      const rows = await tx.cartolaMovement.findMany({
        where: { displayId: { not: null } },
        select: { displayId: true },
      });
      base = rows.reduce((m, r) => Math.max(m, parseDisplaySeq(r.displayId)), 0);
    }
    base += 1;
    return formatMovementDisplayId({
      country: movement.country,
      bank: movement.bank,
      account: movement.bankAccount,
      date: movement.date,
      seq: base,
    });
  };
}
