/**
 * Crea o borra usuarios DUMMY de prueba (para validar autorizaciones por rol).
 *
 * Uso (desde la raíz del proyecto):
 *   node scripts/dummy-user.cjs create-all        # crea 1 dummy por cada rol
 *   node scripts/dummy-user.cjs delete-all        # borra todos los dummy
 *   node scripts/dummy-user.cjs create Cobranza   # crea 1 dummy con ese rol
 *   node scripts/dummy-user.cjs delete Cobranza   # borra ese dummy
 *
 * Lee DATABASE_URL desde .env.local. Usa el mismo hashing (scrypt salt:hash)
 * que lib/user-store.ts, por lo que el login funciona con la contraseña de abajo.
 * Todos los dummy comparten la misma contraseña y su email es dummy.<rol>@smartycash.cl
 */
const fs = require('fs');
const path = require('path');
const { randomBytes, scryptSync } = require('crypto');

const PASSWORD = 'Dummy1234!';
const ROLES = [
  'Administrador',
  'Contabilidad',
  'Recaudacion',
  'ConciliacionMediosDePago',
  'AgenteCC',
  'Cobranza',
];

const emailFor = (role) => `dummy.${role.toLowerCase()}@smartycash.cl`;

function loadEnvLocal() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function createOne(prisma, role) {
  const email = emailFor(role);
  const user = await prisma.user.upsert({
    where: { email },
    update: { role, isActive: true, mustChangePassword: false, passwordHash: hashPassword(PASSWORD) },
    create: {
      email,
      name: `Dummy ${role}`,
      role,
      isActive: true,
      mustChangePassword: false,
      passwordHash: hashPassword(PASSWORD),
    },
  });
  console.log(`  [${role}]  ${email}  (id ${user.id})`);
}

async function deleteOne(prisma, role) {
  const email = emailFor(role);
  const res = await prisma.user.deleteMany({ where: { email } });
  console.log(`  borrados ${res.count}: ${email}`);
}

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL no está definido (revisa .env.local).');
    process.exit(1);
  }

  const { PrismaClient } = require('../lib/generated/prisma');
  const prisma = new PrismaClient();

  const action = (process.argv[2] || 'create-all').toLowerCase();
  const role = process.argv[3];

  try {
    if (action === 'create-all') {
      console.log('Creando dummies (contraseña común: ' + PASSWORD + '):');
      for (const r of ROLES) await createOne(prisma, r);
    } else if (action === 'delete-all') {
      console.log('Borrando dummies:');
      for (const r of ROLES) await deleteOne(prisma, r);
    } else if (action === 'create' || action === 'delete') {
      if (!ROLES.includes(role)) {
        console.error(`Rol inválido o faltante: "${role}". Válidos: ${ROLES.join(', ')}`);
        process.exit(1);
      }
      console.log(action === 'create' ? 'Creando (pass: ' + PASSWORD + '):' : 'Borrando:');
      await (action === 'create' ? createOne(prisma, role) : deleteOne(prisma, role));
    } else {
      console.error(`Acción desconocida: "${action}". Usa create-all | delete-all | create <rol> | delete <rol>.`);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
