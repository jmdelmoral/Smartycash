# Runbook Prisma — aplicar cambios de base y regenerar cliente

Guía paso a paso para dejar la base y el cliente de Prisma al día (incluye la
columna `displayId` / código visible y las demás migraciones pendientes).

> Contexto: entorno local en Windows, la app se levanta con `npm run dev`.
> Todos los comandos se corren en la terminal, **dentro** de la carpeta
> `limitless-web-starter` (donde está `package.json` y la carpeta `prisma/`).

---

## 0. Detén el servidor de desarrollo

Si tienes `npm run dev` corriendo, párralo con **Ctrl + C** en su terminal.
Prisma no puede regenerar el cliente si Node lo tiene bloqueado (es la causa del
archivo `.tmp` corrupto que arrastrábamos).

---

## 1. Sitúate en la carpeta correcta

```powershell
cd "C:\Users\JoseMigueldelMoral\Downloads\limitless-web-starter-v1.1.2 (1)\limitless-web-starter"
```

Verifica que estás bien parado:

```powershell
dir prisma\schema.prisma
```

Debe existir. Si no aparece, no estás en la carpeta correcta.

---

## 2. Confirma a qué base apuntas (MUY IMPORTANTE)

La variable `DATABASE_URL` (en tu archivo `.env` o `.env.local`) define **qué
base** vas a modificar. Revisa que apunte a tu base de pruebas / desechable y NO
a producción:

```powershell
type .env
```

Busca la línea `DATABASE_URL=...` y confirma host y nombre de base. Todo lo que
sigue MODIFICA esa base.

---

## 3. Limpia el cliente corrupto (si aplica)

Teníamos un cliente generado a medias (un `index.d.ts` truncado y un archivo
temporal `query_engine-windows.dll.node.tmp...`). Bórralo para partir limpio:

```powershell
del "lib\generated\prisma\query_engine-windows.dll.node.tmp*"
```

Si el comando dice que no encuentra el archivo, perfecto: significa que ya no
está. (No borres el resto de la carpeta; `prisma generate` la reescribe.)

---

## 4. Revisa qué migraciones faltan por aplicar

```powershell
npx prisma migrate status
```

- Te lista las migraciones y marca cuáles NO están aplicadas en la base.
- Deberías ver como pendientes (si nunca las aplicaste) estas 8:
  - `20260709130000_add_cartola_close_lifecycle`
  - `20260709140000_add_collection_authorization_code`
  - `20260709150000_add_file_storage`
  - `20260709160000_add_collection_info_request`
  - `20260709170000_add_closures`
  - `20260709180000_add_movement_display_id`  ← la del código visible
  - `20260709190000_add_abono_debito`
  - `20260709200000_add_accounting_category`

Si dice "Database schema is up to date", entonces la columna ya existe y el
problema es otro (ver sección Troubleshooting).

---

## 5. Aplica las migraciones

Elige UNA de las dos opciones según tu situación:

### Opción A — recomendada para tu base de pruebas: `migrate deploy`

Aplica exactamente las migraciones que están en `prisma/migrations/`, sin
generar nuevas ni pedir confirmación. Es la que se usa en despliegues.

```powershell
npx prisma migrate deploy
```

### Opción B — si estás iterando el esquema en local: `migrate dev`

Aplica las pendientes y, si detecta cambios nuevos en `schema.prisma` que aún no
tienen migración, te crea una. Puede pedirte un nombre.

```powershell
npx prisma migrate dev
```

> Si es una base 100% desechable y algo quedó inconsistente, puedes resetearla
> desde cero (BORRA TODOS LOS DATOS de esa base):
> ```powershell
> npx prisma migrate reset
> ```

---

## 6. Regenera el cliente de Prisma

```powershell
npx prisma generate
```

Esto reescribe `lib/generated/prisma` para que el código de la app conozca las
columnas nuevas (incluida `displayId`) y repara el `index.d.ts` truncado.

---

## 7. Verifica que quedó bien

```powershell
npx prisma migrate status
```

Debe decir que la base está al día (sin pendientes).

Chequeo de tipos real (ahora sí confiable, con el cliente regenerado):

```powershell
npx tsc --noEmit
```

No debería reportar errores en `lib/generated/prisma/index.d.ts`. (Errores en
`.next/` se resuelven solos al reconstruir; puedes ignorarlos o borrar la carpeta
`.next`.)

---

## 8. Levanta la app de nuevo

```powershell
npm run dev
```

---

## 9. Haz que los movimientos existentes tomen su código visible

El `displayId` se asigna **al guardar** el movimiento:

- **Movimientos nuevos** (carga masiva o alta manual): nacen ya con
  `CL-BAN-...` automáticamente.
- **Movimientos que ya existían** sin código: reciben el código la próxima vez
  que se guardan. Para forzarlo, edita el movimiento (o haz cualquier cambio que
  dispare la sincronización) y al recargar verás el código visible.

---

## Troubleshooting

**En la terminal de `npm run dev` aparece `Unknown column 'displayId'` o
`Unknown argument 'displayId'` al sincronizar cartola.**
→ Falta aplicar la migración (paso 5) o regenerar el cliente (paso 6). Es
exactamente el síntoma que resuelven esos pasos.

**`prisma generate` falla con "EPERM" / archivo en uso.**
→ El server de dev sigue corriendo. Detenlo (paso 0), borra el `.tmp` (paso 3) y
reintenta.

**`migrate deploy` falla con "migration already applied" o drift.**
→ La base y el historial de migraciones no coinciden. En una base desechable, lo
más limpio es `npx prisma migrate reset` (borra datos) y luego `migrate deploy`.

**Sigo sin ver el código visible tras todo esto.**
→ Con `npm run dev` abierto, abre las DevTools del navegador → pestaña Network →
provoca un guardado → busca el `POST /api/cartola/movements`. Si responde 200 y
el movimiento sigue sin código, avísame con la respuesta; si responde 4xx/5xx,
pégame el cuerpo del error (ahora la app también lo muestra en rojo arriba).

---

## Resumen ultra corto

```powershell
# (Ctrl+C para detener npm run dev)
cd "C:\Users\JoseMigueldelMoral\Downloads\limitless-web-starter-v1.1.2 (1)\limitless-web-starter"
del "lib\generated\prisma\query_engine-windows.dll.node.tmp*"
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
npm run dev
```
