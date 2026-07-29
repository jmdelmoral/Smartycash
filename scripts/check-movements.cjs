/**
 * Diagnóstico: imprime los últimos movimientos de cartola con su displayId
 * (código visible) directamente desde la base, para verificar si el servidor
 * lo está guardando.
 *
 * Uso:  node scripts/check-movements.cjs
 */
const fs = require('fs');
const path = require('path');

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

(async () => {
  const { PrismaClient } = require('../lib/generated/prisma');
  const prisma = new PrismaClient();
  try {
    const total = await prisma.cartolaMovement.count();
    const conCodigo = await prisma.cartolaMovement.count({ where: { displayId: { not: null } } });
    const rows = await prisma.cartolaMovement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, displayId: true, status: true, createdAt: true },
    });

    console.log(`\nTotal movimientos: ${total}  |  con displayId: ${conCodigo}\n`);
    console.log('Últimos 10 (id interno -> displayId -> estado):');
    for (const r of rows) {
      console.log(`  ${r.id}  ->  ${r.displayId ?? '(NULL)'}  ->  ${r.status}`);
    }
    console.log('');
  } catch (err) {
    console.error('ERROR:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
