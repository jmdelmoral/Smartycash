import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

import prisma from './prisma';

export type UserRole =
  | 'Administrador'
  | 'Contabilidad'
  | 'Recaudacion'
  | 'ConciliacionMediosDePago'
  | 'AgenteCC'
  | 'Cobranza';

export type AppUser = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  passwordHash?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type PublicUser = Omit<AppUser, 'passwordHash'>;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) {
    return false;
  }
  const incomingHash = scryptSync(password, salt, 64);
  const expectedHash = Buffer.from(originalHash, 'hex');
  return incomingHash.length === expectedHash.length && timingSafeEqual(incomingHash, expectedHash);
}

function generateRandomPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function toPublicUser(user: any): PublicUser {
  // Omit passwordHash for public view
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safeUser } = user;
  return safeUser as PublicUser;
}

export async function ensureSeedAdminUser(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) return;

  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@smartycash.cl').toLowerCase();
  // No hardcoded default password: if ADMIN_PASSWORD is not provided we generate
  // a strong random one and log it ONCE so there is no well-known default in the
  // codebase. The admin must change it on first login (mustChangePassword).
  const providedPassword = process.env.ADMIN_PASSWORD;
  const adminPassword = providedPassword ?? generateRandomPassword(16);
  await prisma.user.create({
    data: {
      email: adminEmail,
      name: 'Administrador SmartyCash',
      role: 'Administrador',
      isActive: true,
      mustChangePassword: true,
      passwordHash: hashPassword(adminPassword),
    },
  });
  if (!providedPassword) {
    console.warn(
      `[seed] Usuario administrador inicial creado: ${adminEmail}\n` +
        `[seed] Contraseña temporal generada: ${adminPassword}\n` +
        `[seed] Cámbiala en el primer inicio de sesión. No se volverá a mostrar. ` +
        `Para fijarla tú mismo, define ADMIN_PASSWORD en el entorno antes del primer arranque.`
    );
  }
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<PublicUser | null> {
  await ensureSeedAdminUser();
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive || !user.passwordHash) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return toPublicUser(user);
}

export async function listUsers(): Promise<PublicUser[]> {
  await ensureSeedAdminUser();
  const users = await prisma.user.findMany();
  return users.map(toPublicUser);
}

export async function getUserByEmail(email: string): Promise<PublicUser | null> {
  await ensureSeedAdminUser();
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  return user ? toPublicUser(user) : null;
}

export async function createUser(input: {
  name: string;
  email: string;
  role: UserRole;
}): Promise<{ user: PublicUser; temporaryPassword: string }> {
  await ensureSeedAdminUser();
  const normalizedEmail = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new Error('El email ya existe.');
  }
  const temporaryPassword = generateRandomPassword();
  const newUser = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: input.name.trim(),
      role: input.role as any,
      isActive: true,
      mustChangePassword: true,
      passwordHash: hashPassword(temporaryPassword),
    },
  });
  return { user: toPublicUser(newUser), temporaryPassword };
}

export async function updateUserStatus(userId: string, isActive: boolean): Promise<PublicUser> {
  await ensureSeedAdminUser();
  const target = await prisma.user.update({ where: { id: userId }, data: { isActive } });
  if (!target) throw new Error('Usuario no encontrado.');
  return toPublicUser(target);
}

export async function changeUserPassword(email: string, nextPassword: string): Promise<void> {
  await ensureSeedAdminUser();
  const target = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!target) throw new Error('Usuario no encontrado.');
  await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { passwordHash: hashPassword(nextPassword), mustChangePassword: false },
  });
}

export async function resetUserPassword(
  userId: string
): Promise<{ user: PublicUser; temporaryPassword: string }> {
  await ensureSeedAdminUser();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error('Usuario no encontrado.');
  const temporaryPassword = generateRandomPassword();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(temporaryPassword), mustChangePassword: true },
  });
  return { user: toPublicUser(updated), temporaryPassword };
}
