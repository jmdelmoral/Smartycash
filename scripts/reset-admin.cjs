/**
 * Restablece la contraseña del usuario administrador.
 *
 * Uso:
 *   node scripts/reset-admin.cjs "NuevaClave123"      # fija esa clave
 *   node scripts/reset-admin.cjs                       # genera una aleatoria y la muestra
 *
 * El admin queda con mustChangePassword = true, así que deberá cambiarla al
 * ingresar. Correo del admin: ADMIN_EMAIL del entorno o "admin@smartycash.cl".
 *
 * Lee DATABASE_URL de process.env; si no está, la toma de .env.local o .env.
 */
const fs = require('fs');
const path = require('path');
const { randomBytes, scryptSync } = require('crypto');

// --- Cargar DATABASE_URL (y ADMIN_EMAIL) desde .env.local / .env si falta ---
function loadEnvFile(file) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
// Prioridad como Next.js: .env.local antes que .env
loadEnvFile('.env.local');
loadEnvFile('.env');

if (!process.env.DATABASE_URL) {
  console.error('No se encontró DATABASE_URL en el entorno ni en .env.local/.env.');
  process.exit(1);
}

// Mismo esquema de hash que lib/user-store.ts: `${salt}:${scrypt(pwd, salt, 64)}`
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function randomPassword(length = 14) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

(async () => {
  const { PrismaClient } = require('../lib/generated/prisma');
  const prisma = new PrismaClient();
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@smartycash.cl').toLowerCase();
    const newPassword = process.argv[2] || randomPassword();

    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      console.error(
        `No existe un usuario con email ${adminEmail}. ` +
          `Revisa ADMIN_EMAIL o crea el admin primero.`
      );
      process.exit(1);
    }

    await prisma.user.update({
      where: { email: adminEmail },
      data: { passwordHash: hashPassword(newPassword), mustChangePassword: true, isActive: true },
    });

    console.log('\n===========================================');
    console.log(' Contraseña de administrador restablecida');
    console.log('===========================================');
    console.log(` Usuario: ${adminEmail}`);
    console.log(` Clave:   ${newPassword}`);
    console.log(' (Deberás cambiarla al iniciar sesión.)');
    console.log('===========================================\n');
  } catch (err) {
    console.error('ERROR al restablecer:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
