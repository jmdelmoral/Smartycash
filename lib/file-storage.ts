/**
 * Abstracción de almacenamiento de archivos.
 *
 * Implementación actual: blob en la base (tabla FileBlob). Para migrar a S3,
 * implementa `FileStorage` con un adaptador S3 y cambia `fileStorage` abajo;
 * el resto del código (endpoints, negocio) no cambia. Los metadatos viven
 * siempre en `SupportFile` (fileName, mimeType, sizeBytes, checksum, backend,
 * storageKey); el binario se guarda/recupera vía este módulo.
 */
import { createHash, randomUUID } from 'crypto';

import prisma from '@/lib/prisma';

export type StorageBackend = 'Db' | 'S3';

export type StoredFile = {
  storageKey: string;
  backend: StorageBackend;
  sizeBytes: number;
  checksum: string;
};

export interface FileStorage {
  save(bytes: Buffer): Promise<StoredFile>;
  load(storageKey: string): Promise<Buffer | null>;
  remove(storageKey: string): Promise<void>;
}

/** Guarda los bytes como blob en la base de datos. */
class DbFileStorage implements FileStorage {
  async save(bytes: Buffer): Promise<StoredFile> {
    const storageKey = randomUUID();
    const checksum = createHash('sha256').update(bytes).digest('hex');
    await prisma.fileBlob.create({ data: { id: storageKey, data: bytes } });
    return { storageKey, backend: 'Db', sizeBytes: bytes.length, checksum };
  }

  async load(storageKey: string): Promise<Buffer | null> {
    const blob = await prisma.fileBlob.findUnique({ where: { id: storageKey } });
    return blob ? Buffer.from(blob.data) : null;
  }

  async remove(storageKey: string): Promise<void> {
    await prisma.fileBlob.deleteMany({ where: { id: storageKey } });
  }
}

// Punto único de cambio para migrar a S3 (implementar S3FileStorage con la
// misma interfaz y reemplazar esta línea).
export const fileStorage: FileStorage = new DbFileStorage();

/** Límite de tamaño y tipos permitidos para comprobantes. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
