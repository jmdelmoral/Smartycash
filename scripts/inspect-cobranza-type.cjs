/**
 * Inspección (solo lectura) del enum `type` de CobranzaDocument y del charset.
 * No modifica nada. Uso: node scripts/inspect-cobranza-type.cjs
 *
 * Sirve para diagnosticar el problema de encoding de 'Nota de Crédito'
 * (schema en UTF-8 vs valor del enum guardado en Latin-1).
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
    const create = await prisma.$queryRawUnsafe('SHOW CREATE TABLE `CobranzaDocument`');
    const ddl = create[0]['Create Table'] || create[0]['create table'] || JSON.stringify(create[0]);
    // Mostrar solo la linea de la columna `type` y el charset de la tabla.
    console.log('\n===== Columna `type` y charset =====');
    for (const l of ddl.split('\n')) {
      if (l.includes('`type`') || l.toUpperCase().includes('CHARSET') || l.toUpperCase().includes('COLLATE')) {
        console.log(l.trim());
      }
    }
    // Bytes crudos del enum guardado (para ver la codificacion de la é).
    const col = await prisma.$queryRawUnsafe(
      "SELECT COLUMN_TYPE, HEX(COLUMN_TYPE) AS COLUMN_TYPE_HEX, CHARACTER_SET_NAME " +
        "FROM information_schema.COLUMNS " +
        "WHERE TABLE_NAME='CobranzaDocument' AND COLUMN_NAME='type'"
    );
    console.log('\n===== information_schema (COLUMN_TYPE + hex + charset) =====');
    console.log(JSON.stringify(col, null, 2));
    console.log(
      '\n(La é correcta en UTF-8 es C3A9; si en el hex aparece E9 suelto, el enum quedo en Latin-1.)'
    );
  } catch (err) {
    console.error('ERROR:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
