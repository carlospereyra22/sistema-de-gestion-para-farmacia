# Estado de implementación

## Base técnica V2

La API incorpora cabeceras de seguridad con Helmet, documentación OpenAPI disponible en `/api/docs`, un `requestId` por petición y respuestas de error consistentes. Las rutas de ventas, compras, inventario, caja, transferencias y reportes validan además que el usuario autenticado tenga asignada la sucursal solicitada.

La especificación funcional/visual V2 y su documento técnico se adoptaron como guía de evolución incremental. Aún faltan varias capacidades de V2, entre ellas balances materializados, historial de precios, alertas persistentes, búsqueda global, auditoría consultable y pruebas E2E/concurrencia completas.

## Transferencias y auditoría

Las transferencias entre sucursales ya tienen un flujo operativo: preparación desde un lote con stock disponible, despacho en la sucursal origen y recepción en la sucursal destino. Cada salida y entrada crea su respectivo movimiento de inventario. La recepción conserva número de lote, vencimiento y costo; si ese lote ya existe para el producto en destino, incrementa su cantidad sin duplicarlo.

La tabla `AuditLog` registra organización, sucursal opcional, actor, entidad, acción y valores anterior/posterior en JSON. Actualmente cubre compras, recepciones directas, ajustes, transferencias, ventas y cierres de caja. Se extenderá gradualmente a las anulaciones y devoluciones.

## Avances operativos adicionales

Los ajustes de inventario operan sobre un lote existente, exigen un motivo, no permiten que el stock resulte negativo y generan tanto movimiento de inventario como registro de auditoría. Las ventas ya aceptan múltiples cobros desde una pantalla POS de búsqueda, carrito y cobro separados; conservan sus líneas, lotes FEFO y pagos en auditoría. La confirmación usa una clave de operación del cliente para que un reintento no pueda duplicar la venta.

El cierre de caja calcula el efectivo esperado a partir del fondo inicial y los pagos en efectivo de la sesión. El efectivo contado, la diferencia y una explicación opcional quedan registrados en auditoría.

Las sesiones de caja admiten ingresos y egresos manuales con importe y motivo. Estos movimientos se auditan y se incorporan al efectivo esperado del cierre.

## Catálogo y reportes

El catálogo permite incorporar código de barras, categoría, laboratorio, principio activo, forma farmacéutica, concentración y presentación al crear productos. Categorías y laboratorios se administran desde la misma pantalla. Los reportes incluyen filtro de período, ventas por día, cobros por medio de pago, productos más vendidos, próximos vencimientos y valor de costo del stock.

## Pendiente del MVP

Las anulaciones de venta restauran los lotes originales y crean movimientos compensatorios; no se permiten después del cierre de una sesión de caja que tenga cobros de esa venta. Las devoluciones de cliente se registran por renglón y quedan fuera del stock vendible hasta una decisión posterior. Las devoluciones a proveedor descuentan el lote y generan su movimiento de salida.

Siguen pendientes balances materializados, reportes detallados por período y la clasificación posterior de una devolución de cliente (reincorporación, descarte o devolución al proveedor).

# Gestión de productos

- Un producto sin uso comercial puede eliminarse definitivamente, para corregir altas duplicadas o de prueba.
- Si el producto tiene compras, lotes, movimientos, ventas, devoluciones o transferencias, el sistema bloquea la eliminación y se debe desactivar para preservar la trazabilidad.
- La pantalla de Productos permite editar nombre, código de barras principal, categoría, laboratorio, datos farmacéuticos y precio general.
