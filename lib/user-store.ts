import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export type UserRole =
  | 'Administrador'
  | 'Contabilidad'
  | 'Recaudación'
  | 'Conciliación medios de pago'
  | 'Agente CC'
  | 'Cobranza';

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  passwordHash: string;
};

type PublicUser = Omit<AppUser, 'passwordHash'>;

const users: AppUser[] = [];

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

function generateId(prefix: string): string {
  const random = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${Date.now()}-${random}`;
}

function toPublicUser(user: AppUser): PublicUser {
  // Never expose password hash outside this module.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export function ensureSeedAdminUser(): void {
  if (users.length > 0) {
    return;
  }
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@smartycash.cl';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin1234!';
  users.push({
    id: generateId('USR'),
    name: 'Administrador SmartyCash',
    email: adminEmail.toLowerCase(),
    role: 'Administrador',
    isActive: true,
    mustChangePassword: true,
    passwordHash: hashPassword(adminPassword),
  });
}

export function authenticateUser(email: string, password: string): PublicUser | null {
  ensureSeedAdminUser();
  const user = users.find((item) => item.email === email.toLowerCase() && item.isActive);
  if (!user) {
    return null;
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return toPublicUser(user);
}

export function listUsers(): PublicUser[] {
  ensureSeedAdminUser();
  return users.map(toPublicUser);
}

export function getUserByEmail(email: string): PublicUser | null {
  ensureSeedAdminUser();
  const target = users.find((item) => item.email === email.toLowerCase());
  return target ? toPublicUser(target) : null;
}

export function createUser(input: {
  name: string;
  email: string;
  role: UserRole;
}): { user: PublicUser; temporaryPassword: string } {
  ensureSeedAdminUser();
  const normalizedEmail = input.email.toLowerCase();
  const existing = users.some((item) => item.email === normalizedEmail);
  if (existing) {
    throw new Error('El email ya existe.');
  }
  const temporaryPassword = generateRandomPassword();
  const newUser: AppUser = {
    id: generateId('USR'),
    name: input.name.trim(),
    email: normalizedEmail,
    role: input.role,
    isActive: true,
    mustChangePassword: true,
    passwordHash: hashPassword(temporaryPassword),
  };
  users.unshift(newUser);
  return { user: toPublicUser(newUser), temporaryPassword };
}

export function updateUserStatus(userId: string, isActive: boolean): PublicUser {
  ensureSeedAdminUser();
  const target = users.find((item) => item.id === userId);
  if (!target) {
    throw new Error('Usuario no encontrado.');
  }
  target.isActive = isActive;
  return toPublicUser(target);
}

export function changeUserPassword(email: string, nextPassword: string): void {
  ensureSeedAdminUser();
  const target = users.find((item) => item.email === email.toLowerCase());
  if (!target) {
    throw new Error('Usuario no encontrado.');
  }
  target.passwordHash = hashPassword(nextPassword);
  target.mustChangePassword = false;
}
