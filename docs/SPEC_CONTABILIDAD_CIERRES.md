# Spec — Módulo de Contabilidad: Cierres mensuales, arrastre y ciclo de vida de movimientos

_Estado: borrador para revisión · Alcance: SmartyCash (validación y conciliación de pagos)_

## Contexto

La aplicación concilia transacciones bancarias (Cartola) contra las validaciones de tres frentes: peticiones de Agente CC (Grupos y Charters / Recaudación), Recaudación y Cobranza. El objetivo final del proceso es que **Contabilidad** pueda **cerrar cada mes** y llevar el rastro contable de cada transacción, incluyendo las que quedan por identificar y se resuelven en periodos posteriores.

Regla de negocio base acordada: **Cartola siempre carga el mes actual y el mes anterior.** Cualquier depósito con antigüedad mayor a eso requiere **validación 100% manual** (búsqueda y enlace explícito).

## Problema

Hoy no existe el concepto de periodo contable ni de cierre. Todos los movimientos viven en un único estado de identificación (sin identificar / parcial / identificado) y no hay forma de:

1. Cerrar un mes dejando registro de qué quedó validado y qué no.
2. Arrastrar los pendientes de un mes cerrado hacia el cierre vigente sin perder su fecha original.
3. Rastrear cuándo se valida finalmente un pendiente y cuándo se hace su asiento contable.
4. Distinguir movimientos "abiertos" de "cerrados parcial" y "cerrados definitivo".

Sin esto, Contabilidad no puede cerrar meses de forma confiable ni auditar el ciclo de vida de una transacción que se resuelve tarde.

## Objetivos

1. Permitir a Contabilidad **cerrar un periodo mensual** con un snapshot (total, identificados, pendientes) y bloqueo de edición posterior.
2. **Arrastrar** los pendientes de periodos cerrados al cierre vigente, conservando su fecha/periodo original y marcándolos como "de periodo anterior".
3. Registrar **trazabilidad contable completa** por movimiento: periodo origen, fecha de validación, fecha de asiento contable, y periodo/cierre donde se finaliza.
4. Dar a Contabilidad un **backlog histórico de "por identificar"** consultable en cualquier momento.
5. Habilitar el **enlace manual** (búsqueda contra histórico de Cartola) para los casos fuera de la ventana mes actual + anterior.

## No-objetivos (v1)

1. **No** reescribir la paginación de Cartola a server-side. La tabla ya pagina a 20 en pantalla; a la escala actual (cientos) no es necesario. Queda como optimización futura (el backend paginado ya existe).
2. **No** cambiar la pre-aprobación automática a un lookup asíncrono contra el API. Con la regla "mes actual + anterior", el match en memoria es suficiente; lo antiguo va por enlace manual.
3. **No** automatizar el asiento contable en un ERP externo. v1 registra fechas/estados; la integración contable es futura.
4. **No** manejar multi-moneda para el cierre más allá de lo que ya existe (montos en la moneda del movimiento). Consolidación multi-moneda es futura.
5. **No** reabrir periodos ya cerrados. Los pendientes fluyen hacia adelante (arrastre), no reabren el mes original.

## Modelo de dominio

### Periodo contable
Un **periodo** es un mes calendario, identificado por año-mes (ej. `2026-06`). Un movimiento pertenece al periodo del **mes de su fecha bancaria** (una transacción del 15/06 es de junio, aunque se identifique en agosto).

Estados del periodo: `Abierto` → `Cerrado`.

### Estado de cierre del movimiento (nuevo, independiente del estado de identificación existente)
- `Abierto`: aún no pasó por ningún cierre.
- `CerradoParcial`: el periodo al que pertenece se cerró estando el movimiento **por identificar**. Sigue vivo, se arrastra y aparece en el cierre vigente marcado como "de periodo anterior".
- `CerradoDefinitivo`: el movimiento quedó **identificado/validado** y fue aceptado en un cierre. No se arrastra más.

> El estado de identificación actual (`Unidentified` / `PartiallyAllocated` / `FullyAllocated`) se mantiene y es ortogonal: describe si el movimiento está conciliado. El estado de cierre describe su situación contable.

### Trazabilidad por movimiento (campos nuevos)
- `originPeriod` (derivado de la fecha bancaria; se puede materializar para consultas).
- `closeState` (Abierto / CerradoParcial / CerradoDefinitivo).
- `validatedAt`: fecha en que se identificó/validó finalmente.
- `asientoContableAt`: fecha del asiento contable.
- `finalizedInPeriodId`: periodo/cierre donde se marcó CerradoDefinitivo (puede ser posterior al origen).
- `closeId`: referencia al evento de cierre que lo finalizó.

### Reglas de transición
1. Movimiento nuevo → `Abierto`.
2. Al **cerrar** el periodo P:
   - Movimientos de P `FullyAllocated` → `CerradoDefinitivo`, `finalizedInPeriodId = P`, se registra `asientoContableAt` (o fecha del cierre).
   - Movimientos de P por identificar (`Unidentified`/`PartiallyAllocated`) → `CerradoParcial`. Permanecen en el backlog "por identificar" y se arrastran.
   - Periodo P → `Cerrado`, con snapshot.
3. Un `CerradoParcial` que se **valida** después:
   - Aparece en el cierre del periodo **abierto vigente** como ítem "de periodo anterior" (conserva su `originPeriod`).
   - Al finalizarse en ese cierre → `CerradoDefinitivo`, con `validatedAt`, `asientoContableAt`, `finalizedInPeriodId = periodo vigente`.
4. Un periodo `Cerrado` **bloquea edición** de sus movimientos, salvo la vía de ajuste (validar un `CerradoParcial`).

## Historias de usuario

### Contabilidad
- Como Contabilidad, quiero **ver la lista de periodos** con su estado y KPIs (total, identificados, pendientes) para saber qué puedo cerrar.
- Como Contabilidad, quiero **cerrar un mes** para congelar su resultado y evitar cambios posteriores no controlados.
- Como Contabilidad, quiero que al abrir el cierre del mes vigente vea **los pendientes arrastrados de meses anteriores**, diferenciados y con su periodo de origen, para incorporarlos al cierre correcto.
- Como Contabilidad, quiero un **backlog "por identificar"** histórico para dar seguimiento a lo que sigue abierto.
- Como Contabilidad, quiero que al validarse un pendiente antiguo **cambien sus estados automáticamente** (a CerradoDefinitivo) y quede registro de fechas de validación y asiento.

### Recaudación / Agente CC
- Como Agente CC, quiero que mi envío pre-apruebe automáticamente cuando el depósito es reciente (mes actual/anterior), sin buscar manualmente.
- Como Recaudación, quiero **buscar en el histórico de Cartola** y **enlazar manualmente** un movimiento antiguo a una solicitud, dejando registro en ambos lados.

### Administrador
- Como Admin, quiero que solo Contabilidad (y Admin) puedan cerrar periodos y procesar ajustes.

## Requerimientos

### Must-Have (P0)
1. **Modelo de periodo y estados de cierre** (schema + migración).
   - Criterios: cada movimiento tiene `closeState` (default `Abierto`); existe entidad `AccountingPeriod` con estado `Abierto`/`Cerrado`; campos de trazabilidad presentes.
2. **Operación de cierre de mes.**
   - Given un periodo `Abierto`, When Contabilidad lo cierra, Then los `FullyAllocated` pasan a `CerradoDefinitivo`, los pendientes a `CerradoParcial`, el periodo queda `Cerrado` y se guarda snapshot (total/identificados/pendientes) — todo en una transacción y auditado.
3. **Arrastre de pendientes al cierre vigente.**
   - Given un movimiento `CerradoParcial` de junio, When Contabilidad abre el cierre de agosto, Then el movimiento aparece listado como "de periodo anterior (junio)" conservando su fecha.
4. **Finalización de pendiente arrastrado.**
   - Given un `CerradoParcial` que ya fue identificado, When se finaliza en el cierre vigente, Then pasa a `CerradoDefinitivo` con `validatedAt`, `asientoContableAt` y `finalizedInPeriodId` registrados.
5. **Bloqueo de edición de periodos cerrados**, excepto la vía de ajuste.
   - Given un periodo `Cerrado`, When se intenta editar/reversar uno de sus movimientos por la vía normal, Then el servidor lo rechaza (salvo validar un `CerradoParcial`).
6. **Autorización**: cerrar/ajustar solo Administrador y Contabilidad (extiende `lib/authz.ts`).
7. **Backlog "por identificar"**: vista/endpoint que lista movimientos con identificación pendiente a través de periodos.
8. **Enlace manual** de movimiento histórico a solicitud de Recaudación, con persistencia en ambos lados y auditoría (usa el GET con búsqueda ya existente).

### Nice-to-Have (P1)
- KPIs y snapshot exportable del cierre (Excel/PDF).
- Filtro del backlog por periodo origen / cuenta / cliente.
- Indicador visual de "arrastrado N meses".

### Future (P2)
- Integración de asiento contable con ERP externo.
- Paginación server-side de Cartola (backend ya listo).
- Consolidación multi-moneda del cierre.
- Endpoint batch para pre-aprobación masiva vía API.

## Cambios de esquema (Prisma) — propuesta

> **Estado:** La **Fase A** ya agregó a `CartolaMovement` los campos `closeState`, `validatedAt`, `asientoContableAt`, `originYear`, `originMonth` (+ índices) vía la migración `20260709130000_add_cartola_close_lifecycle`. La entidad `AccountingPeriod` y `finalizedInPeriodId` quedan **pendientes** para la implementación del módulo de Contabilidad.

```prisma
enum MovementCloseState {
  Abierto
  CerradoParcial
  CerradoDefinitivo
}

enum AccountingPeriodStatus {
  Abierto
  Cerrado
}

model AccountingPeriod {
  id          String                 @id @default(cuid())
  year        Int
  month       Int                    // 1-12
  status      AccountingPeriodStatus @default(Abierto)
  closedAt    DateTime?
  closedById  String?
  // snapshot del cierre
  totalCount      Int?
  identifiedCount Int?
  pendingCount    Int?
  createdAt   DateTime               @default(now())
  updatedAt   DateTime               @updatedAt

  @@unique([year, month])
}

// Campos nuevos en CartolaMovement
//   closeState          MovementCloseState @default(Abierto)
//   validatedAt         DateTime?
//   asientoContableAt   DateTime?
//   finalizedInPeriodId String?
//   originYear / originMonth  (materializados desde `date` para consultas/backlog)
```

> Nota: el mismo patrón de estado de cierre puede extenderse luego a `CobranzaDocument` y `CollectionRequest` si el cierre debe abarcarlos; v1 se centra en `CartolaMovement` como fuente de la transacción bancaria.

## Endpoints propuestos

- `GET /api/contabilidad/periods` → lista de periodos + KPIs.
- `POST /api/contabilidad/periods/close` `{ year, month }` → cierra el periodo (transacción + auditoría + snapshot).
- `GET /api/contabilidad/close/current` → cierre vigente: movimientos del mes + arrastrados de periodos anteriores (diferenciados).
- `POST /api/contabilidad/adjustments/finalize` `{ movementId, asientoContableAt }` → finaliza un `CerradoParcial` identificado.
- `GET /api/contabilidad/backlog` → backlog "por identificar" histórico (con filtros).
- (Reutiliza) `GET /api/cartola/movements?search=&dateFrom=&...` para el enlace manual.

## Plan por fases (sugerido)

1. **Fase A — Esquema y estados** (P0.1): migración de `AccountingPeriod` + campos de cierre/trazabilidad en `CartolaMovement`, sin UI. Backfill de `originYear/originMonth`.
2. **Fase B — Cierre y bloqueo** (P0.2, P0.5, P0.6): endpoint de cierre transaccional + bloqueo de edición en periodos cerrados + autorización.
3. **Fase C — Arrastre y ajustes** (P0.3, P0.4): cierre vigente con arrastrados + finalización de pendientes con trazabilidad.
4. **Fase D — Backlog y enlace manual** (P0.7, P0.8): vista de "por identificar" + buscar/enlazar histórico en Recaudación.
5. **Fase E — Módulo Contabilidad (UI)**: pantallas de periodos, cierre, backlog y ajustes.

Cada fase con typecheck y prueba manual (no hay entorno de ejecución en esta sesión para QA en vivo).

## Preguntas abiertas

1. **[negocio]** ¿El asiento contable (`asientoContableAt`) lo ingresa Contabilidad manualmente al finalizar, o se toma la fecha del cierre? (Bloqueante para Fase C.)
2. **[RESUELTO]** El estado de cierre vive solo en `CartolaMovement` (la transacción bancaria es la unidad que se cierra). Cobranza y Recaudación son mecanismos de validación; su vínculo con el movimiento ya existe vía `CartolaMovementAllocation`. No llevan estado de cierre propio.
3. **[negocio]** ¿"CerradoDefinitivo" se dispara con `FullyAllocated`, o hay un estado/validación adicional específica que lo habilita? (Confirmar el "estado en particular".)
4. **[negocio]** ¿Un periodo puede cerrarse con pendientes siempre, o hay un umbral/aprobación requerida (ej. % máximo por identificar)?
5. **[negocio/UX]** ¿Los arrastrados de varios meses se muestran todos juntos en el cierre vigente o agrupados por periodo origen?
6. **[técnico]** ¿La ventana "mes actual + anterior" de Cartola es fija o configurable por parámetro?

## Anexo — Trabajo ya realizado (contexto)

En sesiones previas se implementó (backend, con typecheck; pendiente de QA en vivo y commit):
- Autorización por rol en Cartola/Cobranza/Recaudación (`lib/authz.ts`), incl. acción de aprobar/rechazar restringida a Recaudación/Admin.
- Eliminación del "sync destructivo": escritura no destructiva (`POST`) + reversa explícita (`DELETE`) en Cartola; guardas de payload vacío y `knownIds`.
- Endurecimiento de auth: sin fallback de `NEXTAUTH_SECRET`; sin contraseña admin por defecto.
- Auditoría dentro de transacción; fix de referencia PNR; limpieza de mojibake; schema Prisma duplicado eliminado; `binaryTargets` + `prebuild: prisma generate` + tracing para Docker/Alpine.
- Paginación en pantalla de Cartola (20/página) y backend paginado + endpoint de exportación (listos para uso futuro).

## Deuda técnica conocida — sincronización por registro (ex-#2)

**Estado: seguro, pendiente de optimizar.** Los tres módulos (Cartola, Cobranza, Recaudación) están protegidos contra borrado masivo (guard de payload vacío + `knownIds` que acota la anulación a lo que el cliente conocía y quitó). No es un problema de seguridad.

**Lo que falta (eficiencia/escala):** hoy el frontend reenvía **todo el conjunto cargado** en cada cambio (debounce 600 ms) y el servidor, por cada registro, borra y recrea sus items/pagos. Editar un solo documento reprocesa los N documentos. No escala a miles.

**Mejora futura:** dirty-tracking en el frontend (enviar solo el registro creado/editado vía `POST`, y `DELETE` explícito al anular), eliminando el reenvío completo. Cartola ya tiene los endpoints `POST`/`DELETE` y el mecanismo no destructivo; Cobranza/Recaudación seguirían el mismo patrón. Conviene hacerlo con la app corriendo para poder probar los flujos financieros end-to-end.

## Revisión del modelo de cierre (por rango) — reemplaza el modelo por mes

El cierre no es por mes calendario sino por **rango de fechas** (inicio/fin), y genera un **cierre con id único** que etiqueta las transacciones. "Asiento"/exportación SAP queda **pendiente** (sin formato aún).

**Entidades (Fase B, ya en el esquema):**
- `Closure`: id único, `dateFrom`/`dateTo`, `createdBy`, `createdAt`, y snapshot (`totalCount`, `identifiedCount`, `pendingCount`, montos). Permite cierres parciales (semanal/quincenal) y múltiples en el tiempo.
- `ClosureItem`: detalle por movimiento en ese cierre (para auditoría): `closeState` (CerradoParcial/CerradoDefinitivo), `identificationType` (categoría), `amount`, `originYear/Month`, `carriedFromClosureId` (si finaliza un arrastrado).
- `CartolaMovement.finalizedInClosureId`: el cierre donde quedó CerradoDefinitivo.

**Estados del movimiento:** `Abierto` → `CerradoParcial` (tomado en un cierre pero aún sin identificar) → `CerradoDefinitivo` (identificado, dentro o después del periodo).

**Algoritmo de "Generar cierre" (Fase C, propuesto):**
1. Incluye: movimientos con fecha en [dateFrom, dateTo] que están `Abierto`, MÁS todos los `CerradoParcial` de cierres anteriores (arrastrados), sin importar su fecha.
2. Estado en este cierre por movimiento: identificado (FullyAllocated) → `CerradoDefinitivo`; si no → `CerradoParcial`.
3. Crea `Closure` (id único + snapshot) y un `ClosureItem` por movimiento (con `carriedFromClosureId` si venía Parcial de otro cierre).
4. Actualiza cada movimiento: `closeState` nuevo; si Definitivo, `finalizedInClosureId = este cierre`.

**Reporte / resumen:** por cierre, resumen por categoría (tipo de identificación) de identificados + "por identificar" (pendientes); y para arrastrados que ahora se identifican, reflejar **salida negativa en "por identificar" y entrada positiva en la categoría** (reclasificación).

**Bloqueo:** un movimiento `CerradoDefinitivo` no se edita más en Cartola; un `CerradoParcial` sí (para poder identificarlo en cierres posteriores).
