import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { auditAction } from '@/lib/audit';
import { authOptions } from '@/lib/auth';
import { resetUserPassword } from '@/lib/user-store';

/** Restablece la contraseña de un usuario (solo Administrador). Genera una
 *  temporal, fuerza cambio en el próximo login y audita la acción. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? session?.roles?.[0];
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (role !== 'Administrador') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const parsed = z.object({ id: z.string().min(1) }).safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  try {
    const result = await resetUserPassword(parsed.data.id);
    await auditAction({
      actorId: session.user.id,
      action: 'user_password_reset',
      module: 'Usuarios',
      entityType: 'User',
      entityId: parsed.data.id,
      request,
    });
    return NextResponse.json({ user: result.user, temporaryPassword: result.temporaryPassword });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo restablecer la contraseña';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
