/**
 * Diagnóstico: cuenta y lista las solicitudes de recaudación (CollectionRequest)
 * que hay en la base, para saber si están persistiendo.
 *
 * Uso:  node scripts/check-requests.cjs
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
    const total = await prisma.collectionRequest.count();
    const rows = await prisma.collectionRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, status: true, amount: true, authorizationCode: true, createdAt: true },
    });
    console.log(`\nTotal solicitudes de recaudación en la base: ${total}\n`);
    for (const r of rows) {
      console.log(`  ${r.id}  |  ${r.status}  |  $${r.amount}  |  cod:${r.authorizationCode ?? '-'}  |  ${r.createdAt.toISOString().slice(0, 10)}`);
    }
    console.log('');
  } catch (err) {
    console.error('ERROR:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
