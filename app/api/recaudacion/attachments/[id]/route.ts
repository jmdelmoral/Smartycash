import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { canRead, canWrite } from '@/lib/authz';
import { fileStorage } from '@/lib/file-storage';
import prisma from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

/** Sirve el binario del comprobante (inline) para visualizarlo/descargarlo. */
export async function GET(_request: Request, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canRead(session, 'Recaudacion')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const { id } = await params;
  const file = await prisma.supportFile.findUnique({
    where: { id },
    select: { fileName: true, mimeType: true, storageKey: true },
  });
  if (!file || !file.storageKey) {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }

  const bytes = await fileStorage.load(file.storageKey);
  if (!bytes) {
    return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': file.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Content-Length': String(bytes.length),
    },
  });
}

/** Elimina un comprobante (metadatos + binario). */
export async function DELETE(_request: Request, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canWrite(session, 'Recaudacion')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const { id } = await params;
  const file = await prisma.supportFile.findUnique({
    where: { id },
    select: { storageKey: true },
  });
  if (file?.storageKey) {
    await fileStorage.remove(file.storageKey);
  }
  await prisma.supportFile.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
