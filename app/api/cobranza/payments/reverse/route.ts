import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions, getAppSession } from '@/lib/auth';
import { canRead, canWrite } from '@/lib/authz';
import prisma from '@/lib/prisma';

/**
 * D 4b-2 - Reversar un pago de Cobranza de forma ATOMICA: anula (voidedAt) el
 * Payment y su CartolaMovementAllocation, restituye el saldo del documento y
 * recalcula el movimiento (o restituye la Nota de Credito si la fuente era NC).
 */
const bodySchema = z
  .object({
    paymentId: z.string().min(1).optional(),
    documentId: z.string().min(1).optional(),
    movementId: z.string().min(1).optional(),
    amount: z.coerce.number().positive().optional(),
  })
  .refine((b) => Boolean(b.paymentId) || Boolean(b.documentId && b.amount), {
    message: 'Se requiere paymentId, o documentId + amount',
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
  const { paymentId, documentId, movementId, amount: reqAmount } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Se puede reversar por id de pago, o (documentId + monto [+ movimiento]),
      // porque la UI del pago no siempre tiene el id a mano.
      const payment = paymentId
        ? await tx.payment.findUnique({ where: { id: paymentId }, include: { document: true } })
        : await tx.payment.findFirst({
            where: {
              documentId,
              voidedAt: null,
              amount: reqAmount,
              ...(movementId ? { movementId } : {}),
            },
            include: { document: true },
            orderBy: { createdAt: 'desc' },
          });
      if (!payment) throw { code: 404, msg: 'Pago no encontrado' };
      if (payment.voidedAt) return { alreadyVoided: true };

      const amount = Number(payment.amount);

      // Fuente movimiento bancario: anular asignacion + recalcular movimiento.
      if (payment.movementId) {
        const movement = await tx.cartolaMovement.findUnique({
          where: { id: payment.movementId },
          include: { allocations: true },
        });
        if (movement && movement.closeState === 'CerradoDefinitivo' && !canRead(session, 'Contabilidad')) {
          throw {
            code: 403,
            msg: `El movimiento ${movement.displayId ?? movement.id} esta CERRADO contablemente. Solo Contabilidad puede reversar.`,
          };
        }
        if (payment.allocationId) {
          await tx.cartolaMovementAllocation.updateMany({
            where: { id: payment.allocationId, voidedAt: null },
            data: { voidedAt: new Date(), voidedReason: 'Reversa de pago Cobranza' },
          });
        }
        if (movement) {
          const remaining = movement.allocations
            .filter((a) => !a.voidedAt && a.id !== payment.allocationId)
            .reduce((s, a) => s + Number(a.amount), 0);
          await tx.cartolaMovement.update({
            where: { id: movement.id },
            data: {
              identificationType: remaining > EPS ? 'CobranzaCredito' : 'SinIdentificar',
              status:
                remaining <= EPS
                  ? 'Unidentified'
                  : remaining + EPS < Number(movement.amount)
                    ? 'PartiallyAllocated'
                    : 'FullyAllocated',
            },
          });
        }
      } else if (payment.creditNoteDocumentId) {
        // Fuente Nota de Credito: restituir su saldo pendiente.
        const nc = await tx.cobranzaDocument.findUnique({ where: { id: payment.creditNoteDocumentId } });
        if (nc) {
          const restored = round2(Number(nc.pendingAmount) + amount);
          const total = round2(Number(nc.totalAmount));
          await tx.cobranzaDocument.update({
            where: { id: nc.id },
            data: {
              pendingAmount: restored,
              status: restored >= total - EPS ? 'Pendiente' : restored <= EPS ? 'Pagado' : 'Parcial',
            },
          });
        }
      }

      // Anular el pago.
      await tx.payment.update({
        where: { id: payment.id },
        data: { voidedAt: new Date(), voidedReason: 'Reversa manual' },
      });

      // Restituir saldo del documento pagado.
      const doc = payment.document;
      const restored = round2(Number(doc.pendingAmount) + amount);
      const total = round2(Number(doc.totalAmount));
      const newStatus = restored <= EPS ? 'Pagado' : restored >= total - EPS ? 'Pendiente' : 'Parcial';
      await tx.cobranzaDocument.update({
        where: { id: doc.id },
        data: { pendingAmount: restored, status: newStatus },
      });

      await auditAction(
        {
          actorId: session.user.id,
          action: 'payment_reversed',
          module: 'Cobranza',
          entityType: 'Payment',
          entityId: payment.id,
          after: { documentId: doc.id, restored, newStatus },
          request,
        },
        tx
      );

      return { restored, newStatus };
    }, { timeout: 20000 });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const e = err as { code?: number; msg?: string };
    if (e && typeof e.code === 'number' && e.msg) {
      return NextResponse.json({ error: e.msg }, { status: e.code });
    }
    return NextResponse.json(
      { error: 'No fue posible reversar el pago', detail: String((err as Error)?.message ?? err) },
      { status: 500 }
    );
  }
}
