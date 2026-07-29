/**
 * Resumen de un cierre a partir de sus ClosureItem.
 * Categoría = tipo de identificación del movimiento. "Por identificar" = los
 * ítems que quedaron CerradoParcial. La reclasificación lista los ítems que
 * finalizan un arrastrado (Definitivo con carriedFromClosureId): representan la
 * salida del bucket "por identificar" de un periodo anterior.
 */
export interface ClosureItemLike {
  movementId: string;
  closeState: string; // CerradoParcial | CerradoDefinitivo
  identificationType: string; // Adquiriente | GC | CobranzaCredito | SinIdentificar
  amount: unknown; // Prisma Decimal
  carriedFromClosureId: string | null;
}

export type CategoryTotal = { count: number; amount: number };

export type ClosureSummary = {
  porCategoria: Record<string, CategoryTotal>;
  identificadoTotal: CategoryTotal;
  porIdentificar: CategoryTotal;
  reclasificaciones: { movementId: string; amount: number; category: string }[];
};

const add = (t: CategoryTotal, amount: number): CategoryTotal => ({
  count: t.count + 1,
  amount: t.amount + amount,
});

export function summarizeClosureItems(items: ClosureItemLike[]): ClosureSummary {
  const porCategoria: Record<string, CategoryTotal> = {};
  let identificadoTotal: CategoryTotal = { count: 0, amount: 0 };
  let porIdentificar: CategoryTotal = { count: 0, amount: 0 };
  const reclasificaciones: { movementId: string; amount: number; category: string }[] = [];

  for (const it of items) {
    const amount = Number(it.amount);
    if (it.closeState === 'CerradoDefinitivo') {
      const cat = it.identificationType;
      porCategoria[cat] = add(porCategoria[cat] ?? { count: 0, amount: 0 }, amount);
      identificadoTotal = add(identificadoTotal, amount);
      if (it.carriedFromClosureId) {
        reclasificaciones.push({ movementId: it.movementId, amount, category: cat });
      }
    } else {
      porIdentificar = add(porIdentificar, amount);
    }
  }

  return { porCategoria, identificadoTotal, porIdentificar, reclasificaciones };
}
