import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { changeUserPassword } from '@/lib/user-store';

const schema = z.object({
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Contraseña inválida (mínimo 8 caracteres)' }, { status: 400 });
  }

  try {
    changeUserPassword(email, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar contraseña';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
