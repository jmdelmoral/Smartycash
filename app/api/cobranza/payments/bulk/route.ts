import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { getAppSession } from '@/lib/auth';
import { canRead, canWrite } from '@/lib/authz';
import prisma from '@/lib/prisma';

/**
 * D 4b-2 / Fase 5 - Aplicación MASIVA de pagos de Cobranza, server-side y atómica
 * POR FILA. Reemplaza la carga masiva que mutaba el array compartido en el cliente.
 * Cada fila resuelve su documento (número + tipo) y su fuente (movimiento bancario
 * por displayId/id, o Nota de Crédito por número) y aplica el pago igual que los
 * endpoints single (Payment + CartolaMovementAllocation, o Payment NC). Una fila que
 * falla no afecta a las demás.
 */
const rowSchema = z.object({
  documentNumber: z.string().min(1),
  typeCode: z.string().optional().default(''),
  sourceRef: z.string().min(1),
  amount: z.coerce.number().positive().optional(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(5000),
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

  const results: Array<{
    index: number;
    documentNumber: string;
    sourceRef: string;
    ok: boolean;
    applied?: number;
    error?: string;
  }> = [];

  for (let index = 0; index < parsed.data.rows.length; index++) {
    const row = parsed.data.rows[index]!;
    try {
      const applied = await prisma.$transaction(async (tx) => {
        const doc = await tx.cobranzaDocument.findFirst({
          where: {
            documentNumber: row.documentNumber,
            status: { not: 'Anulado' },
            ...(row.typeCode ? { typeCode: row.typeCode } : {}),
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!doc) throw { msg: 'Documento no encontrado' };
        const docPending = round2(Number(doc.pendingAmount));
        if (docPending <= EPS) throw { msg: 'El documento no tiene saldo pendiente' };

        // Resolver fuente: primero movimiento bancario (displayId o id), luego NC.
        const movement = await tx.cartolaMovement.findFirst({
          where: { OR: [{ id: row.sourceRef }, { displayId: row.sourceRef }] },
          include: { allocations: true },
        });

        if (movement) {
          if (movement.closeState === 'CerradoDefinitivo' && !canRead(session, 'Contabilidad')) {
            throw { msg: `Movimiento ${movement.displayId ?? movement.id} CERRADO contablemente.` };
          }
          const usedBefore = movement.allocations
            .filter((a) => !a.voidedAt)
            .reduce((s, a) => s + Number(a.amount), 0);
          const available = round2(Number(movement.amount) - usedBefore);
          let amount = Math.min(available, docPending);
          if (row.amount !== undefined) amount = Math.min(amount, round2(row.amount));
          amount = round2(amount);
          if (amount <= EPS) throw { msg: 'Sin saldo aplicable en el movimiento' };

          const allocation = await tx.cartolaMovementAllocation.create({
            data: {
              movementId: movement.id,
              module: 'Cobranza',
              sourceEntityType: 'CobranzaPayment',
              sourceEntityId: doc.id,
              amount,
              detail: `Pago Cobranza ${doc.documentNumber} (carga masiva)`,
              createdById: session.user.id,
              cobranzaDocumentId: doc.id,
            },
          });
          const payment = await tx.payment.create({
            data: {
              documentId: doc.id,
              sourceType: 'BankMovement',
              movementId: movement.id,
              allocationId: allocation.id,
              amount,
              date: movement.date,
              bank: movement.bank,
              createdById: session.user.id,
            },
          });
          const usedAfter = usedBefore + amount;
          await tx.cartolaMovement.update({
            where: { id: movement.id },
            data: {
              identificationType: 'CobranzaCredito',
              status:
                usedAfter + EPS < Number(movement.amount) ? 'PartiallyAllocated' : 'FullyAllocated',
            },
          });
          const newPending = Math.max(round2(docPending - amount), 0);
          const total = round2(Number(doc.totalAmount));
          await tx.cobranzaDocument.update({
            where: { id: doc.id },
            data: {
              pendingAmount: newPending,
              status: newPending <= EPS ? 'Pagado' : newPending >= total - EPS ? 'Pendiente' : 'Parcial',
            },
          });
          await auditAction(
            {
              actorId: session.user.id,
              action: 'payment_applied',
              module: 'Cobranza',
              entityType: 'Payment',
              entityId: payment.id,
              after: { documentId: doc.id, movementId: movement.id, amount, bulk: true },
              request,
            },
            tx
          );
          return amount;
        }

        // Fuente Nota de Crédito por número.
        const nc = await tx.cobranzaDocument.findFirst({
          where: { documentNumber: row.sourceRef, type: 'NotaDeCredito', status: { not: 'Anulado' } },
          orderBy: { createdAt: 'desc' },
        });
        if (!nc) throw { msg: `Fuente ${row.sourceRef} no es un movimiento ni una NC válida` };
        const ncAvail = round2(Number(nc.pendingAmount));
        let amount = Math.min(ncAvail, docPending);
        if (row.amount !== undefined) amount = Math.min(amount, round2(row.amount));
        amount = round2(amount);
        if (amount <= EPS) throw { msg: 'Sin saldo aplicable en la NC' };

        const payment = await tx.payment.create({
          data: {
            documentId: doc.id,
            sourceType: 'CreditNote',
            creditNoteDocumentId: nc.id,
            amount,
            date: new Date(),
            bank: 'Aplicación NC',
            createdById: session.user.id,
          },
        });
        const newDocPending = Math.max(round2(docPending - amount), 0);
        const docTotal = round2(Number(doc.totalAmount));
        await tx.cobranzaDocument.update({
          where: { id: doc.id },
          data: {
            pendingAmount: newDocPending,
            status:
              newDocPending <= EPS ? 'Pagado' : newDocPending >= docTotal - EPS ? 'Pendiente' : 'Parcial',
          },
        });
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
            after: { documentId: doc.id, creditNoteId: nc.id, amount, bulk: true },
            request,
          },
          tx
        );
        return amount;
      }, { timeout: 20000 });

      results.push({
        index,
        documentNumber: row.documentNumber,
        sourceRef: row.sourceRef,
        ok: true,
        applied,
      });
    } catch (err: unknown) {
      const e = err as { msg?: string };
      results.push({
        index,
        documentNumber: row.documentNumber,
        sourceRef: row.sourceRef,
        ok: false,
        error: e?.msg ?? String((err as Error)?.message ?? err),
      });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, successCount, total: results.length, results });
}
