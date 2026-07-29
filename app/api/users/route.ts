import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import { createUser, listUsers, updateUserStatus, type UserRole } from '@/lib/user-store';

const createUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  role: z.enum([
    'Administrador',
    'Contabilidad',
    'Recaudacion',
    'ConciliacionMediosDePago',
    'AgenteCC',
    'Cobranza',
  ] as [UserRole, ...UserRole[]]),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? session?.roles?.[0];
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (role !== 'Administrador') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }
  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? session?.roles?.[0];
  if (role !== 'Administrador') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  try {
    const result = await createUser(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear usuario';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? session?.roles?.[0];
  if (role !== 'Administrador') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const body = await request.json();
  const statusSchema = z.object({
    id: z.string().min(1),
    isActive: z.boolean(),
  });
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  try {
    const user = await updateUserStatus(parsed.data.id, parsed.data.isActive);
    return NextResponse.json({ user });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo actualizar el estado del usuario';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
