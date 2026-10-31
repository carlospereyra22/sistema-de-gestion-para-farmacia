---
name: nueva-funcionalidad-api
description: Agregar o modificar endpoints, servicios o reglas de negocio en el backend NestJS (apps/api) del sistema de farmacia. Usar al tocar controladores, servicios, DTOs, permisos, transacciones, auditoria, stock, caja, ventas, cuentas corrientes, compras o fiscal.
---

# Nueva funcionalidad en la API (apps/api)

## Antes de escribir codigo

1. Leer `docs/BUSINESS_RULES.md` y el documento del dominio (ver indice en `AGENTS.md`).
   Si la regla pedida contradice una regla vigente, frenar y preguntar: no se agregan
   reglas comerciales por inferencia.
2. Ubicar el modulo en `apps/api/src/<modulo>/`. No crear modulos nuevos si el dominio
   ya existe. Un modulo no escribe en tablas de otro salvo que la arquitectura lo
   documente (ej. Compras -> SupplierPayables con la misma TransactionClient).
3. Para fiscal (ARCA/WSAA/WSFE) leer ademas `docs/FISCAL_BILLING.md` y
   `docs/PRODUCTION_FISCAL_CHECKLIST.md`. Nunca habilitar emision productiva ni tocar
   credenciales sin pedido explicito.

## Patrones obligatorios

**Rutas y guards**
- Prefijo global `/api/v1`. Rutas por organizacion: `organizations/:organizationId/...`.
- Operaciones fisicas (ventas, stock, caja, compras, transferencias, reportes):
  `organizations/:organizationId/branches/:branchId/...` con
  `@UseGuards(JwtAccessGuard, BranchAccessGuard)`.
- El actor es `req.auth!.sub`. Validar UUIDs con `ParseUUIDPipe`.

**DTOs**: clases con `class-validator` en el controlador o en `<modulo>.dto.ts`.
`ValidationPipe` global usa `whitelist` + `forbidNonWhitelisted`: todo campo nuevo
necesita decorador o se rechaza.

**Permisos**: cada metodo del servicio verifica el permiso del actor en la organizacion
(patron `assert`/`assertPermission(actorId, organizationId, "CODIGO")`).
Codigos existentes: `*_READ` / `*_MANAGE` para ORGANIZATION, USER, ROLE, CATALOG,
INVENTORY, PURCHASE, SALE, CASH, ACCOUNT, PARTY, PAYABLE, y `REPORT_READ`.
Un permiso nuevo requiere seed + migracion de datos y decision documentada.

**Multi-tenant**: toda entidad comercial lleva `organizationId`; operaciones fisicas
llevan `branchId`. Filtrar siempre por ellos en `where`. Nada de casos especiales por
sucursal concreta.

**Transacciones y auditoria**
- Toda operacion con mas de una escritura va en `this.prisma.$transaction(async (tx) => ...)`.
- La auditoria se escribe DENTRO de la misma transaccion (`tx.auditLog.create` o
  `audit.recordInTransaction(tx, ...)`) con organizationId, branchId, actorId,
  entityType, entityId, action y before/after.
- Concurrencia: bloquear filas con
  ``tx.$queryRaw`SELECT id FROM "Tabla" WHERE id=${id}::uuid FOR UPDATE` `` o usar
  `isolationLevel: Prisma.TransactionIsolationLevel.Serializable` (saldos, credito)
  / `RepeatableRead` (lecturas consistentes). El filtro global traduce P2034 a 409.
- Edicion concurrente: recibir `expectedUpdatedAt` / saldo esperado / precio esperado
  y rechazar con 409 si cambio.
- No mantener una transaccion abierta mientras se llama a un servicio externo (ARCA).

**Idempotencia**: operaciones que el cliente puede reintentar (ventas, cobros,
recepciones, pagos, distribuciones) reciben un `requestId`/clave UUID unica por
organizacion y guardan un hash sha256 del payload; mismo id + mismo hash devuelve el
resultado previo, mismo id + hash distinto es 409.

**Dinero y fechas**
- Importes en centavos `BigInt` (`amountMinor`, `unitPriceMinor`...). Nunca float.
  En JSON se devuelven como string (`.toString()`), se reciben como string o entero.
- Timestamps en UTC. Fechas civiles (vencimientos) como `DATE` calendario Argentina.

**Historial**: no borrar registros comerciales. Anular = estado u operacion
compensatoria (movimiento inverso, credito). Bajas = logicas (`deletedAt`, `active`).
Stock: todo cambio genera `InventoryMovement`; no se permite stock negativo.

**Errores**: lanzar excepciones Nest (`BadRequestException`, `ConflictException`,
`ForbiddenException`, `NotFoundException`). Los mensajes que ve el usuario van en
espanol rioplatense ("Revisá...", "Actualizá y volvé a intentarlo.").

## Estructura y tests

- Extraer reglas puras a archivos chicos del modulo (ej. `sales/sale-unit-price.ts`) y
  testearlas con `*.spec.ts` al lado (Jest, sin base de datos).
- Comportamiento transaccional/concurrente: test de integracion en
  `apps/api/test/<tema>.integration.spec.ts`, copiando el patron de esquema aislado de
  `supplier-payables.integration.spec.ts` (solo corre contra `gestion_dev` local y
  borra su esquema al final).
- Si cambia el contrato compartido con la web, actualizar `packages/contracts` (solo
  tipos, sin logica).
- Si cambia el esquema, seguir la skill `migracion-prisma`.

## Al terminar

Seguir la skill `cerrar-tarea` (checks + documentacion).
