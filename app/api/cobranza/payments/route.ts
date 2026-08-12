import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions, getAppSession } from '@/lib/auth';
import { canRead, canWrite } from '@/lib/authz';
import { parseDateInput } from '@/lib/business-mappers';
import prisma from '@/lib/prisma';

/**
 * D 4b-2 - Aplicar un pago de Cobranza (fuente: movimiento bancario) de forma
 * ATOMICA en el servidor: crea el Payment Y la CartolaMovementAllocation que
 * consume el saldo del movimiento, y recalcula documento y movimiento.
 *
 * Reemplaza el modelo viejo (cliente muta el array + doble sync). ADITIVO hasta
 * que el cliente lo consuma (4c/Fase 5).
 */
const bodySchema = z.object({
  documentId: z.string().min(1),
  movementId: z.string().min(1),
  amount: z.coerce.number().positive(),
  date: z.string().min(1),
});

const EPS = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canWrite(session, 'Cobranza')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
  }
  const { documentId, movementId, amount, date } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.cobranzaDocument.findUnique({ where: { id: documentId } });
      if (!doc) throw { code: 404, msg: 'Documento no encontrado' };
      if (doc.status === 'Anulado') throw { code: 400, msg: 'El documento esta anulado' };

      const movement = await tx.cartolaMovement.findUnique({
        where: { id: movementId },
        include: { allocations: true },
      });
      if (!movement) throw { code: 404, msg: 'Movimiento no encontrado' };

      // Gate de cierre contable.
      if (movement.closeState === 'CerradoDefinitivo' && !canRead(session, 'Contabilidad')) {
        throw {
          code: 403,
          msg: `El movimiento ${movement.displayId ?? movement.id} esta CERRADO contablemente. Solo Contabilidad puede aplicarle pagos.`,
        };
      }

      const usedBefore = movement.allocations
        .filter((a) => !a.voidedAt)
        .reduce((s, a) => s + Number(a.amount), 0);
      const available = round2(Number(movement.amount) - usedBefore);
      if (round2(amount) > available + EPS) {
        throw {
          code: 400,
          msg: `El monto ($${round2(amount)}) excede el saldo disponible del movimiento ($${available}).`,
        };
      }
      if (round2(amount) > round2(Number(doc.pendingAmount)) + EPS) {
        throw {
          code: 400,
          msg: `El monto ($${round2(amount)}) excede el saldo pendiente del documento ($${round2(Number(doc.pendingAmount))}).`,
        };
      }

      // 1) Asignacion que consume el saldo del movimiento (fuente de verdad server-side).
      const allocation = await tx.cartolaMovementAllocation.create({
        data: {
          movementId: movement.id,
          module: 'Cobranza',
          sourceEntityType: 'CobranzaPayment',
          sourceEntityId: documentId,
          amount,
          detail: `Pago Cobranza ${doc.documentNumber}`,
          createdById: session.user.id,
          cobranzaDocumentId: documentId,
        },
      });

      // 2) Registro de pago enlazado a la asignacion.
      const payment = await tx.payment.create({
        data: {
          documentId,
          sourceType: 'BankMovement',
          movementId: movement.id,
          allocationId: allocation.id,
          amount,
          date: parseDateInput(date),
          bank: movement.bank,
          createdById: session.user.id,
        },
      });

      // 3) Recalcular movimiento (identificacion + estado).
      const usedAfter = usedBefore + amount;
      await tx.cartolaMovement.update({
        where: { id: movement.id },
        data: {
          identificationType: 'CobranzaCredito',
          status: usedAfter + EPS < Number(movement.amount) ? 'PartiallyAllocated' : 'FullyAllocated',
        },
      });

      // 4) Recalcular documento.
      const newPending = Math.max(round2(Number(doc.pendingAmount) - amount), 0);
      const total = round2(Number(doc.totalAmount));
      const newStatus = newPending <= EPS ? 'Pagado' : newPending >= total - EPS ? 'Pendiente' : 'Parcial';
      await tx.cobranzaDocument.update({
        where: { id: documentId },
        data: { pendingAmount: newPending, status: newStatus },
      });

      await auditAction(
        {
          actorId: session.user.id,
          action: 'payment_applied',
          module: 'Cobranza',
          entityType: 'Payment',
          entityId: payment.id,
          after: { documentId, movementId, amount, newPending, newStatus },
          request,
        },
        tx
      );

      return { paymentId: payment.id, allocationId: allocation.id, newPending, newStatus };
    }, { timeout: 20000 });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const e = err as { code?: number; msg?: string };
    if (e && typeof e.code === 'number' && e.msg) {
      return NextResponse.json({ error: e.msg }, { status: e.code });
    }
    return NextResponse.json(
      { error: 'No fue posible aplicar el pago', detail: String((err as Error)?.message ?? err) },
      { status: 500 }
    );
  }
}
