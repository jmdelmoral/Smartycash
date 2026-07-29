import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth';
import { canWrite } from '@/lib/authz';
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES, fileStorage } from '@/lib/file-storage';
import prisma from '@/lib/prisma';

/**
 * Sube uno o varios comprobantes (multipart, campo "files"). Guarda el binario
 * vía la abstracción de storage y crea el SupportFile (metadatos). Devuelve los
 * ids para que el frontend los asocie a la solicitud en el guardado.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (!canWrite(session, 'Recaudacion')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }

  const form = await request.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'No se recibieron archivos' }, { status: 400 });
  }

  // Si viene, vincula los comprobantes directo a una solicitud existente.
  const linkTo = form.get('collectionRequestId');
  const collectionRequestId =
    typeof linkTo === 'string' && linkTo.trim() !== '' ? linkTo : undefined;

  const attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }> = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `El archivo ${file.name} supera el límite de ${MAX_FILE_BYTES / 1024 / 1024} MB.` },
        { status: 400 }
      );
    }
    const mimeType = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: `Tipo no permitido (${mimeType}) en ${file.name}. Use PDF, JPG, PNG o WEBP.` },
        { status: 400 }
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const stored = await fileStorage.save(bytes);
    const record = await prisma.supportFile.create({
      data: {
        fileName: file.name,
        mimeType,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksum,
        storageKey: stored.storageKey,
        backend: stored.backend,
        collectionRequestId,
        uploadedById: session.user.id,
      },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
    });
    attachments.push({
      id: record.id,
      fileName: record.fileName,
      mimeType: record.mimeType ?? mimeType,
      sizeBytes: record.sizeBytes ?? stored.sizeBytes,
    });
  }

  return NextResponse.json({ attachments }, { status: 201 });
}
