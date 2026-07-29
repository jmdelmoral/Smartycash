/**
 * Diagnóstico del usuario administrador y de la contraseña.
 *
 * Uso:
 *   node scripts/check-admin.cjs                 # revisa admin@smartycash.cl
 *   node scripts/check-admin.cjs "SmartyCash2026"  # además prueba esa clave
 *   node scripts/check-admin.cjs "clave" otro@correo.cl
 *
 * Imprime: a qué base apunta, si el usuario existe, si está activo, si tiene
 * hash de contraseña, y (si se pasó) si la clave coincide con el hash guardado.
 */
const fs = require('fs');
const path = require('path');
const { scryptSync } = require('crypto');

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) return false;
  const incoming = scryptSync(password, salt, 64).toString('hex');
  return incoming === originalHash;
}

function maskUrl(u) {
  if (!u) return '(sin DATABASE_URL)';
  return u.replace(/(mysql:\/\/[^:]+:)[^@]*(@)/, '$1****$2');
}

(async () => {
  const email = (process.argv[3] || process.env.ADMIN_EMAIL || 'admin@smartycash.cl').toLowerCase();
  const testPassword = process.argv[2];

  console.log('\nDATABASE_URL:', maskUrl(process.env.DATABASE_URL));
  console.log('Email a revisar:', email, '\n');

  const { PrismaClient } = require('../lib/generated/prisma');
  const prisma = new PrismaClient();
  try {
    const total = await prisma.user.count();
    const user = await prisma.user.findUnique({ where: { email } });

    console.log('Total usuarios en la base:', total);
    if (!user) {
      console.log(`>> El usuario "${email}" NO existe en esta base.`);
      // Muestra los emails que sí existen, para detectar diferencias.
      const all = await prisma.user.findMany({ select: { email: true, isActive: true } });
      console.log('Usuarios existentes:', all.map((u) => `${u.email}${u.isActive ? '' : ' (inactivo)'}`).join(', ') || '(ninguno)');
    } else {
      console.log('>> Usuario encontrado:');
      console.log('   isActive:', user.isActive);
      console.log('   tiene passwordHash:', !!user.passwordHash);
      console.log('   mustChangePassword:', user.mustChangePassword);
      console.log('   role:', user.role);
      if (testPassword) {
        console.log(`   ¿coincide la clave "${testPassword}"? ->`, verifyPassword(testPassword, user.passwordHash));
      }
    }
    console.log('');
  } catch (err) {
    console.error('ERROR:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
