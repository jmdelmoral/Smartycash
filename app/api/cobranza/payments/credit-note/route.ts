import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions } from '@/lib/auth';
import { canWrite } from '@/lib/authz';
import prisma from '@/lib/prisma';

/**
 * D 4b-2 (NC) - Aplicar una Nota de Credito a un documento de forma ATOMICA en el
 * servidor: crea el Payment (sourceType CreditNote) y reduce el pendiente del
 * documento objetivo Y de la NC. No toca cartola (es doc-a-doc). ADITIVO.
 *
 * La reversa se maneja en /api/cobranza/payments/reverse (rama creditNoteDocumentId).
 */
const bodySchema = z.object({
  documentId: z.string().min(1),
  creditNoteId: z.string().min(1),
  amount: z.coerce.number().positive().optional(),
});

const EPS = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
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
  const { documentId, creditNoteId } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.cobranzaDocument.findUnique({ where: { id: documentId } });
      if (!doc) throw { code: 404, msg: 'Documento no encontrado' };
      if (doc.status === 'Anulado') throw { code: 400, msg: 'El documento esta anulado' };

      const nc = await tx.cobranzaDocument.findUnique({ where: { id: creditNoteId } });
      if (!nc) throw { code: 404, msg: 'Nota de credito no encontrada' };
      if (nc.type !== 'NotaDeCredito') throw { code: 400, msg: 'El documento fuente no es Nota de Credito' };
      if (nc.status === 'Anulado') throw { code: 400, msg: 'La nota de credito esta anulada' };

      const ncAvail = round2(Number(nc.pendingAmount));
      const docPend = round2(Number(doc.pendingAmount));
      const maxApply = Math.min(ncAvail, docPend);
      const amount = parsed.data.amount ? round2(parsed.data.amount) : maxApply;
      if (amount <= 0) throw { code: 400, msg: 'No hay saldo aplicable (NC o documento sin pendiente)' };
      if (amount > maxApply + EPS) {
        throw {
          code: 400,
          msg: `El monto ($${amount}) excede el maximo aplicable ($${maxApply}) entre saldo de NC ($${ncAvail}) y pendiente del documento ($${docPend}).`,
        };
      }

      const payment = await tx.payment.create({
        data: {
          documentId,
          sourceType: 'CreditNote',
          creditNoteDocumentId: nc.id,
          amount,
          date: new Date(),
          bank: 'Aplicación NC',
          createdById: session.user.id,
        },
      });

      // Documento objetivo.
      const newDocPending = Math.max(round2(docPend - amount), 0);
      const docTotal = round2(Number(doc.totalAmount));
      await tx.cobranzaDocument.update({
        where: { id: documentId },
        data: {
          pendingAmount: newDocPending,
          status: newDocPending <= EPS ? 'Pagado' : newDocPending >= docTotal - EPS ? 'Pendiente' : 'Parcial',
        },
      });

      // Nota de credito (consume su saldo).
      const newNcPending = Math.max(round2(ncAvail - amount), 0);
      const ncTotal = round2(Number(nc.totalAmount));
      await tx.cobranzaDocument.update({
        where: { id: nc.id },
        data: {
          pendingAmount: newNcPending,
          status: newNcPending <= EPS ? 'Pagado' : newNcPending >= ncTotal - EPS ? 'Pendiente' : 'Parcial',
        },
      });

      await auditAction(
        {
          actorId: session.user.id,
          action: 'payment_applied_creditnote',
          module: 'Cobranza',
          entityType: 'Payment',
          entityId: payment.id,
          after: { documentId, creditNoteId, amount, newDocPending, newNcPending },
          request,
        },
        tx
      );

      return { paymentId: payment.id, amount, newDocPending, newNcPending };
    }, { timeout: 20000 });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const e = err as { code?: number; msg?: string };
    if (e && typeof e.code === 'number' && e.msg) {
      return NextResponse.json({ error: e.msg }, { status: e.code });
    }
    return NextResponse.json(
      { error: 'No fue posible aplicar la nota de credito', detail: String((err as Error)?.message ?? err) },
      { status: 500 }
    );
  }
}
