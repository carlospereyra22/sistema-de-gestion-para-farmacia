# Compras y recepciones — ampliación V2

## Auditoría previa

Stack: React/TypeScript/Vite/Tailwind, NestJS REST, Prisma/PostgreSQL; monolito modular existente.

- Existe: `Purchase` y `PurchaseItem` con cantidades pedidas/recibidas y costos históricos. `POST purchases` ya admite varias líneas, pero `Purchases` en workspace-shell enviaba sólo una.
- Existe incompleto: `PurchasesService.receive` acredita ProductLot y crea InventoryMovement dentro de una transacción; calcula PARTIALLY_RECEIVED. Le faltaban bloqueo de compra, idempotencia y agrupación de recepciones.
- Falta: formulario amplio, recepción conjunta/multilote, historial por entrega, cierre explícito de saldo, metadata de comprobante y creación directa.
- Historial existente: OperationHistory usa getPurchases y filtros locales. Se conserva su consulta y se extiende la información.
- Inventario independiente conserva sus endpoints y permisos. No se reemplaza su motor ni se crean compras automáticas por ingresos manuales.

## Plan mínimo

1. Extender aditivamente el modelo sin recalcular stock histórico; respaldar la base local antes de aplicar migraciones.
2. Reutilizar creación multiartículo y acreditación transaccional; bloquear cada compra y registrar una clave por entrega.
3. Reemplazar únicamente el formulario limitado por un editor amplio y recepción conjunta revisable.
4. Probar regresión 200 unidades, entregas 100/60/40, multilote, errores atómicos, concurrencia, permisos y precios intactos.

El catálogo actual no tiene una bandera de lote/vencimiento obligatorio por tipo. Se conserva su política: lote identificado obligatorio y vencimiento opcional; no se inventan exigencias por nombre del producto. Los vencidos siguen siendo stock físico no vendible.

Las recepciones históricas no se recrean. Sus movimientos/auditorías se consultan como legado; sólo las nuevas entregas tienen cabecera y desglose propios.

## Implementación y pantallas

- Compras conserva el encabezado compacto con icono, Nueva compra e Historial, sin KPIs. El listado tiene filtros de producto/código/proveedor/referencia, estado y fechas, y paginación integrada.
- El editor amplio acepta hasta 100 productos distintos. Enter sobre un código agrega el producto y devuelve el foco al buscador; repetirlo enfoca su cantidad, no duplica filas. Costos y cantidades se editan antes de guardar. Guardar pedido no acredita stock.
- Compra directa prepara productos y después cantidades/lotes. Continuar no escribe en la base; confirmar crea compra y primera recepción juntas, atómicamente.
- Recibir permite cantidades parciales, varios artículos y varios lotes con una confirmación global. Las filas vacías/cero quedan pendientes. Se muestran pedido, recibido, pendiente y resumen de esta entrega. El escáner identifica el producto: no inventa lote ni vencimiento.
- El detalle muestra cantidades originales, recibidas, pendientes, no entregadas y costos; cada nueva recepción conserva fecha, usuario, observaciones y lotes. El saldo puede cerrarse con motivo sin revertir stock recibido. No hay eliminación de documentos confirmados.
- Inventario conserva Recibir, Ajustar y Devolver. Al elegir un producto con compras pendientes ofrece abrir la compra correspondiente; no acredita nuevamente lo recibido ni convierte entradas manuales en compras.
- El borrador se conserva por usuario/organización/sucursal en sessionStorage de la pestaña. Se pide confirmación antes de descartarlo. No es un borrador compartido en servidor: cerrar la pestaña o borrar datos del navegador puede perder datos todavía no enviados.
- Antes de enviar se conserva el cuerpo y la clave de operación. Ante respuesta incierta queda bloqueado para reintentar exactamente la misma solicitud, incluso tras recargar. Errores de validación permiten corregir; conflictos actualizan el saldo o verifican que la compra no fue creada antes de habilitar edición.

## Persistencia y compatibilidad

Migración aditiva: `apps/api/prisma/migrations/20261019000000_purchase_receipts_v2/migration.sql`.

Agrega metadata de compra, cantidad no entregada y tablas PurchaseReceipt/PurchaseReceiptItem. El saldo disponible es pedido menos recibido menos no entregado. El cierre se representa con CANCELLED + closedAt/reason y se muestra como Saldo cerrado; no cambia el enum histórico.

El servicio existente PurchasesService sigue siendo el punto de acreditación de ProductLot y de InventoryMovement. Cada entrega bloquea la compra y valida el saldo dentro de la transacción; compra directa, líneas, lotes, movimientos y auditoría se confirman juntos. Las claves de operación son únicas por organización/sucursal y su hash impide reutilizarlas con otro contenido. Bloqueos adicionales ordenados serializan los lotes entre compras concurrentes; los lotes existentes conservan costo y vencimiento, rechazando un vencimiento incompatible. El costo de cada nueva recepción queda registrado por separado.

Se conservan POST purchases y POST purchases/:id/receipts. Clientes antiguos sin clave de operación siguen siendo compatibles, pero no tienen garantía de deduplicación entre reenvíos independientes. La interfaz nueva siempre envía una clave. Los endpoints nuevos son GET purchases/:id, POST purchases/direct, POST purchases/:id/receipts/batch y POST purchases/:id/close-balance. No se cambian ventas, caja, cuenta corriente, listas de precios ni stock por crear un pedido.

## Despliegue y respaldo

1. Antes de migrar, respaldar y ensayar restauración en una base separada. Para la instalación local se agregó `scripts/backup-local-purchases.ps1`, restringido a localhost/gestion_dev. El respaldo se guarda fuera del repositorio, en `%LOCALAPPDATA%/FarmaciaJuncos/RespaldosLocales`, con ACL privada.
2. En esta intervención se generó `compras-v2-20261019-160238.dump` antes de aplicar la migración local. Se verificó su índice con pg_restore --list; no se ensayó su restauración completa.
3. Generar Prisma, ejecutar prisma migrate deploy con el entorno del destino, desplegar API y web compatibles y comprobar salud. La migración ya fue aplicada sólo a la base local, sin reinsertar movimientos históricos. No se desplegó a producción.
4. No editar ni revertir destructivamente la migración aplicada. Si falla la versión, suspender nuevas recepciones y corregir hacia adelante. Una versión anterior no conoce saldos cerrados; no debe habilitarse para escritura indiscriminadamente. Restaurar un respaldo sólo mediante un procedimiento coordinado que preserve las operaciones posteriores; no usarlo como rollback automático.

## Pruebas y alcance

`apps/api/test/purchase-receipts.integration.spec.ts` usa un esquema PostgreSQL aleatorio y datos sintéticos, ejecuta todas las migraciones y elimina únicamente ese esquema de prueba. Cubre 50 líneas sin stock, regresión +200, entregas 100/60/40, multilote, validación, rollback de un conflicto tardío, doble envío, dos conexiones concurrentes, cierre de saldo, compra directa/reintento, permisos/sucursal, costos y precios intactos, lotes vencidos e historial legado.

`apps/web/src/lib/purchases.test.ts` cubre validaciones, centavos, límite conjunto de lotes y saldo cerrado. Prueba de navegador con fetch simulado: 50 códigos, continuación sin POST, lote/vencimiento sin autocompletar, doble clic, interrupción, recarga y repetición idéntica. Las capturas locales están en `.cache/purchase-editor-1366.png` y `.cache/purchase-receive-1366.png`. No se hicieron compras de prueba sobre existencias comerciales reales ni se probó un lector físico: se simularon sus teclas.

El historial anterior puede no contener nombre humano o vencimiento original por movimiento; se muestran los datos disponibles, sin fabricar cabeceras retrospectivas. Tampoco se agregó una política nueva de vencimiento obligatorio por tipo de producto.

## Guía breve para el empleado

1. **Pedido:** Compras → Nueva compra → proveedor → agregar productos por nombre/código → completar cantidades y costos → Guardar pedido.
2. **Entrega parcial:** abrir la compra → Recibir mercadería → completar sólo lo recibido, con sus lotes y vencimientos → revisar el resumen → Confirmar recepción.
3. **Entrega posterior:** abrir la misma compra pendiente y repetir; el saldo se actualiza por artículo.
4. **Llegó sin pedido previo:** Nueva compra → Compra directa → cargar productos → Continuar a recepción → confirmar lo que llegó.
5. **No llegará el resto:** detalle → cerrar saldo → escribir motivo → confirmar. Lo ya recibido permanece en inventario.
6. **Se cortó la conexión:** volver a Continuar borrador y Reintentar misma solicitud; no crear otra compra para el mismo envío incierto.

## Futuro, no implementado automáticamente

Importación de droguerías/Excel/PDF, envío de pedidos, trazabilidad oficial ANMAT/serialización, pagos complejos de proveedores y cuarentena sofisticada quedan fuera de esta ampliación.

## Verificación final — 20/10/2026

- Prettier aplicado y comprobado sobre los archivos modificados (sin reformatear archivos ajenos).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`: correctos. Tests: 439 API, 517 web y 18 del circuito de impresión. Build conserva advertencia de chunks mayores a 500 KB; no impide compilar.
- `prisma migrate status`: 54 migraciones, base local actualizada. Salud API/base: ok.
- Prueba visual y funcional en Edge headless a 1366×768 con datos simulados: correcta; archivos temporales de la web retirados al terminar. Las capturas se conservan en `.cache`.
- No verificado: restauración integral del respaldo, despliegue productivo ni lector de códigos físico. No se cargaron compras sintéticas sobre existencias comerciales.
