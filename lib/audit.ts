import type { TraceModule } from '@/lib/generated/prisma';
import prisma from '@/lib/prisma';

type AuditInput = {
  actorId?: string | null;
  action: string;
  module?: TraceModule;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  request?: Request;
};

function getHeader(request: Request | undefined, name: string): string | undefined {
  return request?.headers.get(name) ?? undefined;
}

export async function auditAction(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? undefined : (input.before as object),
      after: input.after === undefined ? undefined : (input.after as object),
      metadata: input.metadata === undefined ? undefined : (input.metadata as object),
      ipAddress: getHeader(input.request, 'x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: getHeader(input.request, 'user-agent'),
    },
  });
}
