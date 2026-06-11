# Modelo de Datos y Trazabilidad

Este modelo usa una sola base relacional con tablas separadas por dominio. La separacion por tablas permite que los modulos interactuen con integridad referencial, transacciones y auditoria comun.

## Dominios

- Usuarios y acceso: `User`, `Account`, `Session`, `VerificationToken`.
- Maestros compartidos: `Client`, `BankAccount`.
- Venta y referencias comerciales: `SaleReference`.
- Cartola bancaria: `BankStatementImport`, `CartolaMovement`, `CartolaMovementAllocation`.
- Recaudacion: `CollectionRequest`, `CollectionRequestItem`, `SupportFile`.
- Cobranza: `CobranzaDocument`, `CobranzaDocumentItem`, `Payment`.
- Auditoria: `AuditLog`.

## Cadena de Trazabilidad

La trazabilidad esperada es:

`CartolaMovement` -> `CartolaMovementAllocation` -> `CollectionRequest` o `CobranzaDocument` -> `SaleReference` -> `Client`

Cada asignacion de cartola tiene monto propio. Esto permite pagos parciales, un abono aplicado a varios documentos, anulaciones sin borrar historial y conciliaciones futuras por venta o PNR.

## Auditoria

Toda accion relevante debe crear un registro en `AuditLog` con:

- usuario actor,
- modulo,
- entidad afectada,
- accion,
- estado anterior y posterior cuando aplique,
- fecha/hora,
- metadatos tecnicos de la solicitud.

## Migraciones

- `20260609121000_add_business_traceability_tables` agrega tablas de negocio a una base que ya tiene autenticacion.
- `20260609120000_business_traceability_foundation` es una referencia para crear una base limpia desde cero.

Para este proyecto, la migracion incremental ya fue aplicada a la base actual.
