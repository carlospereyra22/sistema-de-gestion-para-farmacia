# Integración V24: inspección y base preparada — 19/09/2026

## Estado de esta entrega

Actualización de alcance 20/09/2026: el usuario eligió evaluar impresión mediante
el navegador y el controlador de cada PC, reutilizando el diseño V24. Ver
BROWSER_PRINT_V24.md. La cola descrita aquí sigue sin activarse. El botón local ya
no contacta al agente; el despliegue y la comparación física siguen pendientes.

**Preparación parcial, no habilitada para producción.** Se agregaron el modelo de cola, el servicio NestJS, controladores, gateway saliente y pruebas de entrega. `PrintingModule` todavía no se importa en `AppModule`. No hay endpoint de creación conectado a documentos ni cambios en los botones del navegador. La migración se aplicó únicamente en gestion_dev local el 20/09/2026 al aplicar las migraciones pendientes para la nueva sección Organización; esto no habilita la cola. No se instaló el Print Box ni se imprimió papel. La impresión anterior sigue vigente.

El documento proporcionado exige conservar intacto `escpos-v21.js`, pero también prohíbe recalcular importes o rellenar datos de ejemplo. El archivo suministrado hace ambas cosas en `normalizeSale`. Una comprobación sin impresora, con subtotal 100, total recibido 80 y descuento 0, devuelve total 100; dirección y contacto vacíos se sustituyen por ejemplos. Se solicitó decidir si se permite adaptar exclusivamente la entrada de datos, conservando el perfil físico. La conexión de documentos y frontend queda pendiente de esa respuesta.

## Inspección del repositorio

1. Backend: NestJS, monolito modular TypeScript estricto.
2. Frontend: React/Vite/Tailwind; `workspace-shell.tsx` muestra la aplicación principal.
3. Base: PostgreSQL, Prisma. Desarrollo `gestion_dev`; producción documentada `gestion_prod`.
4. Venta: `Sale`, `SaleItem`, `SalePayment`. Importes en centavos BigInt. No existe entidad Remito independiente: se genera un `ThermalTicket` desde la venta persistida. Sucursales en `Branch`; usuarios y nombres por organización en `User`/`UserOrganization`; caja y sesión en `CashRegister`/`CashSession`.
5. Sucursal activa: selección en la interfaz, enviada en rutas organización/sucursal; `BranchAccessGuard` verifica asignación a sucursal activa.
6. Existe caja, pero no una terminal de impresión o impresora vinculada antes de esta propuesta. `SalePayment.cashSessionId` relaciona los pagos en efectivo con una sesión.
7. Sesiones persistidas y JWT de acceso, verificadas en `JwtAccessGuard`.
8. Roles y permisos por organización, más asignaciones `UserBranch`.
9. Ventas: `GET organizations/:organizationId/branches/:branchId/sales/:saleId/ticket`; cobros: `GET organizations/:organizationId/accounts/:customerId/receipts/:receiptId`, con instantánea histórica cuando existe.
10. VPS documentado: Oracle Ubuntu; `/home/ubuntu/gestion-app`, PostgreSQL local. No se verificó su estado remoto en esta entrega.
11. Reverse proxy: Nginx HTTPS publica `/api/v1/`; frontend Netlify con proxy de mismo origen descrito en el despliegue.
12. Backend: `gestion-api.service` bajo systemd, Node, reinicio automático. No hay que introducir el broker HTTP de demostración como otro servicio.
13. No se encontró cola de impresión, Redis, WebSocket o SSE vigente. La nueva cola usa PostgreSQL y polling saliente.
14. Impresión actual: navegador → agente Windows en loopback → RAW. Existe HTML legado sin conectar al flujo principal. Esta entrega todavía no reemplaza ese circuito.

## Referencia física

Los archivos `escpos-v21.js` de CLOUD_PRINT y PRUEBA_LOCAL_IMPRESION son idénticos por SHA-256: `302FFE341810558AD8D38E4F6B45015225D5B5BA2F52A54D6221F353B3EB1A5E`.

La prueba local antepone `1F 1B 1F 13 14 04` al resultado del renderer. No ejecutamos su script de impresión ni `sampleSale()` contra la impresora. Los originales externos permanecen sin modificaciones. `raw-print.ps1` se copió como helper al nuevo gateway.

Pendiente: importar renderer y bitmaps como referencia inmutable, generar comparación binaria, decidir adaptación de importes/encabezado y mantener el logo configurable, datos de cliente/sucursal, cobros y estados de anulación existentes. No confundir conservar el layout aprobado con perder datos del sistema actual.

## Archivos preparados

Modificados:

- `apps/api/prisma/schema.prisma`: PrintGateway, Printer, PrintJob y enum PrintJobStatus.
- `package.json`: incorpora las pruebas del nuevo transporte a `test:thermal`.

Nuevos:

- `apps/api/prisma/migrations/20260919010000_cloud_print_queue/migration.sql`.
- `apps/api/src/printing/print-queue.service.ts`.
- `apps/api/src/printing/printing.controller.ts`.
- `apps/api/src/printing/printing.module.ts`.
- `apps/api/src/printing/print-queue.spec.ts`.
- `scripts/print-box/gateway.js`.
- `scripts/print-box/journal.js`.
- `scripts/print-box/delivery.js`.
- `scripts/print-box/delivery.test.js`.
- `scripts/print-box/raw-print.ps1`.
- Este documento.

## Cola propuesta

Navegador → API autenticada → PrintJob con RAW inmutable en PostgreSQL → HTTPS saliente del gateway → journal persistente → spooler Windows → confirmación al VPS.

`Printer` incluye sucursal, gateway, nombre de Windows, perfil y vínculo opcional a caja. Las claves compuestas impiden relacionar un job con una impresora/gateway de otra organización o sucursal. La impresora explícita se valida; sin selección se busca la de caja, predeterminada y finalmente única impresora disponible. Si no puede resolverse se pide selección.

`PrintJob` conserva payload/hash, documento, usuario, intención, referencia de reimpresión, estado, intentos y lease. Se serializa cada intención con un bloqueo transaccional de PostgreSQL y una clave única por organización/requestId. Crear y auditar se hace en la misma transacción. El mismo requestId con otro documento, sucursal, usuario o impresora explícita se rechaza.

Solo el gateway autenticado recibe sus trabajos. Se entrega uno por vez y el ACK requiere el lease exacto. Los leases vencidos se entregan al mismo gateway para consultar su journal; nunca se transfieren ciegamente a otra máquina. Si se reemplaza un equipo o se pierde su journal, detener y conciliar los trabajos pendientes antes de habilitarlo. El estado PRINTED significa aceptado por el spooler, no papel físicamente verificado.

Las credenciales del gateway se generan aleatoriamente, se devuelven una vez y se guardan como SHA-256 en la base. Rotar o deshabilitar requiere ORGANIZATION_MANAGE; la credencial nunca va al frontend operativo ni a logs. Su instalación protegida en el equipo fijo sigue pendiente.

## Protección local

El journal se escribe y sincroniza antes de enviar bytes. Si hay error parcial o reinicio entre el envío y el registro de éxito, se informa resultado incierto y no se reimprime. Tras éxito se registra antes del ACK; si el ACK se pierde, la siguiente entrega solo confirma. No se borran automáticamente los registros ni se interpreta un archivo corrupto como vacío. Un error previo al spool permite reintento acotado con espera.

El gateway valida HTTPS (HTTP solo con allowLocalTest explícito y loopback), rechaza redirects y verifica hash/perfil. No escucha puertos TCP entrantes. La named pipe local impide dos procesos de la misma instalación. Mantiene logs rotados sin ticket ni credenciales. La instalación como servicio/tarea de sistema con runtime estable y ACL protegidas todavía no está entregada.

## Pendiente antes de habilitar

1. Resolver adaptación del renderer y probar equivalencia binaria contra los originales.
2. Implementar mapping de ventas/cobros desde la API y conectar encolado/status/reimpresión en la web.
3. Completar instalador, configuración segura y administración/registro de impresoras.
4. Probar migración y concurrencia contra una base aislada de PostgreSQL; los tests de servicio actuales usan dobles, no prueban concurrencia real.
5. Verificar y desplegar en el VPS con respaldo y migraciones, sin seed de desarrollo. Configurar primera sucursal/gateway/impresora explícitamente.
6. Probar físicamente desde otra PC, gateway offline, reinicio Windows, errores de spool y pérdida de ACK. Mantener piloto de una sucursal antes de ampliar.

No hay instrucciones operativas de instalación ni garantía de aceptación final hasta completar estos puntos. La evidencia actual es de pruebas automatizadas, no validación del VPS, del dispositivo o de otra computadora.

## Rollback de esta preparación

Como el módulo aún no se habilitó ni la migración se aplicó, no hay datos de producción que revertir. Si se continúa y se aplica la migración, conservar las tablas y jobs históricos; deshabilitar gateways y detener claims antes de cambiar de circuito. Nunca pasar jobs inciertos automáticamente al agente anterior o al navegador: podría duplicar comprobantes.
