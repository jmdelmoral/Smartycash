/**
 * Repara movimientos "huérfanos": movimientos de cartola identificados como GC
 * (Recaudación) que NO tienen una solicitud activa (Preaprobado/Aprobado) que los
 * respalde. Los devuelve a "por identificar" (limpia allocations, estado
 * Unidentified, tipo SinIdentificar).
 *
 * Esto pasó porque antes cartola y recaudación se guardaban por separado y
 * podían desalinearse. Con la reconciliación atómica en el servidor ya no debería
 * volver a ocurrir; este script limpia lo que quedó de antes.
 *
 * Uso:
 *   node scripts/fix-orphan-movements.cjs           # muestra qué haría (dry-run)
 *   node scripts/fix-orphan-movements.cjs --apply   # aplica los cambios
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

const APPLY = process.argv.includes('--apply');

(async () => {
  const { PrismaClient } = require('../lib/generated/prisma');
  const prisma = new PrismaClient();
  try {
    // Movimientos identificados como GC (recaudación) que no estén reversados.
    const gcMovements = await prisma.cartolaMovement.findMany({
      where: { identificationType: 'GC', status: { not: 'Reversed' } },
      select: { id: true, displayId: true },
    });

    const orphans = [];
    for (const mov of gcMovements) {
      const backing = await prisma.collectionRequest.findFirst({
        where: {
          associatedMovementId: mov.id,
          status: { in: ['Preaprobado', 'Aprobado'] },
        },
        select: { id: true },
      });
      if (!backing) orphans.push(mov);
    }

    console.log(`\nMovimientos GC: ${gcMovements.length}  |  huérfanos (sin solicitud activa): ${orphans.length}\n`);
    for (const o of orphans) {
      console.log(`  ${o.displayId ?? o.id}`);
    }

    if (!APPLY) {
      console.log('\n(dry-run) No se aplicó ningún cambio. Corre con --apply para revertirlos.\n');
      return;
    }

    for (const o of orphans) {
      await prisma.$transaction([
        prisma.cartolaMovementAllocation.deleteMany({ where: { movementId: o.id } }),
        prisma.cartolaMovement.update({
          where: { id: o.id },
          data: { identificationType: 'SinIdentificar', status: 'Unidentified' },
        }),
      ]);
      console.log(`  revertido -> ${o.displayId ?? o.id}`);
    }
    console.log(`\nListo. ${orphans.length} movimiento(s) devuelto(s) a "por identificar".\n`);
  } catch (err) {
    console.error('ERROR:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
