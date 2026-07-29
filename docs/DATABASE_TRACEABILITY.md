# Modelo de Datos y Trazabilidad

Este modelo usa una sola base relacional con tablas separadas por dominio. La separacion por tablas permite que los modulos interactuen con integridad referencial, transacciones y auditoria comun.

## Dominios

- Usuarios y acceso: `User`, `Account`, `Session`, `VerificationToken`.
- Maestros compartidos: `Client`, `BankAccount`.
  - `Client.appCode` es el ID visible del cliente en el aplicativo, con formato `CLI-000001`.
  - `BankAccount.displayId` es el ID visible de la cuenta bancaria, con formato por pais, por ejemplo `CL-CTA-000001`.
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

- `20260609120000_business_traceability_foundation` es una referencia para crear una base limpia desde cero.
- `20260615100000_add_visible_master_codes` agrega IDs visibles para clientes/cuentas y datos extendidos de cuentas bancarias.

## Pendientes Externos

- Envio de correo al crear/restablecer usuarios: queda pendiente de configurar credenciales SMTP o un proveedor externo de correo.
- El flujo recomendado es enviar un enlace de definicion/restablecimiento de contrasena, no una contrasena plana por correo.
