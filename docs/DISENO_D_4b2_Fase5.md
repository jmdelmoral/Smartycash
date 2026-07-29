# Diseño — D 4b-2 (asignación de pagos server-side) + Fase 5 (quitar array compartido)

> Estado al escribir esto: hecho y verificado en vivo → Fase 1, Fase 2 (Recaudación),
> Fase 3 3a/3b (Cartola paginada + escrituras por registro + export completo), 4a
> (endpoint de fuentes de pago), 4b-1 (selector/validación de pago desde el endpoint).
> Pendiente → **4b-2**, **4c**, **Fase 5** (deben hacerse juntos; ver más abajo).

## Por qué 4b-2 y Fase 5 van JUNTOS (bloqueador del "pisado")

Hoy dos sistemas escriben sobre el mismo movimiento de cartola:

1. `PUT /api/cobranza/documents` **solo** crea/borra registros `Payment`
   (route: `payment.deleteMany` + `payment.create` por cada `document.payments`).
   **No** crea `CartolaMovementAllocation`.
2. La **asignación** que consume el saldo del movimiento la crea el **sync de Cartola**:
   el cliente hace `setMovements(...)` en `onAssociatePayment`/`onReversePayment`
   (CobranzaManagement) y `page.tsx` sincroniza el **array compartido** con
   `PUT /api/cartola/movements` (upsert de todo el array con `knownIds`).

Si 4b-2 mueve la creación de la asignación al servidor (dentro del PUT de Cobranza o
un endpoint dedicado) pero se deja vivo el sync del array compartido de Cartola, el
sync de Cartola reenvía el movimiento **sin** esa asignación y la **borra** → se pierde
o duplica la conciliación de un pago. Por eso 4b-2 exige eliminar el sync/array
compartido de Cartola (Fase 5) en el mismo cambio.

## Modelo objetivo

- **Ni Cartola ni Cobranza** dependen del array compartido `movements` de `page.tsx`.
- Cartola: ya escribe por registro (3b) y lee su propia página (3a).
- Cobranza: aplica/reversa pagos por **endpoint dedicado** (nuevo), que persiste
  atómicamente el `Payment` **y** la `CartolaMovementAllocation` del movimiento.
- `page.tsx`: deja de cargar el array completo y de sincronizar Cartola. Cada módulo
  se autoabastece. **Aquí recién baja el payload inicial.**

## 4b-2 — Endpoints de pago (dinero, atómico)

### POST `/api/cobranza/payments` (aplicar)
Body: `{ documentId, movementId, amount, date }`.
En una transacción:
1. Cargar documento y movimiento. Validar:
   - `amount > 0`.
   - `amount <= document.pendingAmount + EPS`.
   - saldo disponible del movimiento = `movement.amount − Σ(asignaciones no anuladas)`;
     `amount <= disponible + EPS`.
   - gate de cierre contable: si `movement.closeState === 'CerradoDefinitivo'` y el rol
     no es Contabilidad/Admin → 403.
2. `payment.create` (sourceType `BankMovement`, `movementId`, `amount`, `date`, `bank`).
3. `cartolaMovementAllocation.create` en el movimiento:
   - `module = 'Cobranza'`, `sourceEntityType = 'CobranzaPayment'`,
     `sourceEntityId = <payment.id>` (clave para reversar sin ambigüedad),
     `amount`, `saleReferenceId` = upsert PNR/ref del `documentNumber`,
     `detail = 'Pago Cobranza <documentNumber>'`.
4. Recalcular movimiento: `identificationType = 'CobranzaCredito'`,
   `status = movementStatusFromDocuments(...)` sobre el nuevo total de asignaciones.
5. Recalcular documento: `pendingAmount`, `status` (Pendiente/Parcial/Pagado).
6. Auditar (`payment_applied`).

### POST `/api/cobranza/payments/reverse` (reversar)
Body: `{ paymentId }` (preferible al par movimiento+monto, evita ambigüedad).
En una transacción:
1. Cargar payment + su documento + movimiento. Gate de cierre contable igual que arriba.
2. Borrar (o `voidedAt`) la `CartolaMovementAllocation` con
   `sourceEntityType='CobranzaPayment'` y `sourceEntityId = payment.id`.
3. Borrar (o `voidedAt`) el `Payment`.
4. Recalcular movimiento: si quedan asignaciones de cobranza → `CobranzaCredito`,
   si no → `SinIdentificar`; `status` recomputado.
5. Recalcular documento: `pendingAmount`, `status`.
6. Nota de crédito (source `CreditNote`): restituir saldo a la NC (sin tocar cartola).
7. Auditar (`payment_reversed`).

> Nota: hoy el `PUT /api/cobranza/documents` hace `payment.deleteMany` + recrear en cada
> sync. Al pasar a endpoints dedicados, **quitar** la recreación de `Payment` de ese PUT
> (o dejar de enviar `payments` en el sync de documentos) para no tener dos fuentes de
> verdad de los pagos. Definir esto explícitamente antes de codear.

## 4c / Fase 5 — Cliente y page.tsx

- CobranzaManagement: `onAssociatePayment` y `onReversePayment` llaman a los endpoints
  nuevos y **refrescan** (documentos + fuentes de pago). Quitar los `setMovements`.
- Quitar el lookup por id en la reversa (`movements.find` para `closeState`): el gate ya
  se valida en el servidor; el cliente no necesita el array.
- Cartola (carga masiva de detalles): el único `setMovements` que queda busca movimientos
  por `MovimientoID` cross-página en el array. Convertir a: buscar esos movimientos en el
  servidor (endpoint de lookup por ids/displayIds) + persistir por registro (PUT).
- `page.tsx`: eliminar la carga completa de `movements`, el estado compartido y el efecto
  `syncCartola`. Cada componente se autoabastece. Revisar Recaudación (ya no usa el array,
  pero recibe el prop) y quitar props muertos.

## Matriz de pruebas (mínimo, en vivo, antes de confiar)

1. Aplicar pago **total** a una factura → factura Pagada; movimiento pasa a
   CobranzaCredito con saldo 0; el movimiento **desaparece** de las fuentes de pago.
2. Aplicar pago **parcial** → factura Parcial; movimiento con saldo restante; sigue
   apareciendo en fuentes con el disponible correcto.
3. **Dos facturas** pagadas con el **mismo** movimiento (consumo parcial cada una) →
   saldos correctos; el movimiento acumula 2 asignaciones.
4. **Reversar** uno de esos dos pagos → restituye esa factura; el movimiento conserva la
   otra asignación y sigue CobranzaCredito; disponible correcto.
5. Reversar el último pago → movimiento vuelve a SinIdentificar.
6. Gate de cierre contable: intentar aplicar/reversar sobre movimiento
   CerradoDefinitivo con rol no-Contabilidad → 403.
7. Pago con **Nota de Crédito** → restitución de saldo NC en reversa; cartola intacta.
8. Verificar que **no** hay pisado: tras aplicar un pago, recargar y confirmar que la
   asignación persiste (no la borra ningún sync).

## Orden de ejecución sugerido

1. Endpoints `payments` (aplicar/reversar) + quitar recreación de pagos del PUT de
   documentos. Probar por API los 8 casos.
2. Cliente Cobranza: cablear a los endpoints, quitar `setMovements`. Probar en vivo.
3. Cartola carga-masiva-detalles: lookup server-side + PUT por registro.
4. `page.tsx`: quitar array compartido + `syncCartola`. Regresión completa de Cartola,
   Recaudación y Cobranza.
5. Recién aquí: medir la baja de payload inicial.

## Requisitos del entorno para hacerlo seguro

- Poder correr `npx prisma generate` + `tsc`/build y **levantar la app** (esto ya lo hace
  el usuario).
- Idealmente datos de prueba con: 1 movimiento consumible por 2 facturas, 1 NC, 1
  movimiento CerradoDefinitivo. Sirve para cubrir la matriz.
