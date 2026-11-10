# Resumen visual de Inicio

El resumen operativo de Inicio usa `DashboardOverview`, un componente de presentación separado del contenedor que consulta los datos. Conserva los valores, cálculos y destinos de navegación existentes.

## Rediseño SISTEMA-85 (10/11/2026)

Esta sección reemplaza lo que se contradiga más abajo (accesos rápidos, KPI de inventario con minigráficos, alertas de caja y compras).

- **Estilo común**: las tarjetas usan el de Caja y Reportes (`cash-card`, `reportCardClass`: borde `#dce7ef`, radio 14 px, sombra suave) con iconos redondos de color suave, sin fondos saturados. Texto mínimo de 12 px y tablas en `text-sm`.
- **Buscador de medicamentos**: la fuente se elige con `ProductFilterSelect` (versión completa, `h-12`), igual que los filtros de Productos. Buscador y botón también en `h-12`. La tarjeta no recorta su contenido, así la lista del selector no queda cortada.
- **Seis KPI** (`lib/dashboard-metrics.ts`): Ventas hoy (con la curva de 7 días, la variación contra ayer y la cantidad de tickets), Ticket promedio, A cobrar en cuentas corrientes, Caja, Deuda con proveedores y Compras por recibir. Van en 2 columnas desde `sm`, 3 desde `lg` y 6 desde `2xl`, con 168 px de alto mínimo en todos los estados (cargando, con datos y sin conexión). Son informativas, sin navegación. Un importe nunca se parte en dos líneas: la letra se achica según el largo (`metricValueClass`).
  - **Caja, caja por caja**: una sucursal puede tener varias cajas. Con una sola, la tarjeta lleva el nombre de la caja y su efectivo esperado, o «Cerrada». Con varias muestra «N de M abiertas», una fila por caja (primero las abiertas, hasta dos) con su efectivo esperado y, en la nota, el total esperado y cuántas cajas quedan sin mostrar. El efectivo esperado sale de `CashService.branchRegistersStatus`, con el mismo cálculo que la pantalla de Caja (`summarizeSessions`).
  - **Deuda con proveedores**: el valor es el total adeudado de la sucursal, el mismo «Saldo del listado» de Cuentas por pagar sin filtros. La nota dice cuánto está vencido y cuánto vence en los próximos 7 días; si no hay nada urgente, «Al día · próximo vencimiento dd/mm/aa». Se pinta rojo si hay deuda vencida, ámbar si vence algo en 7 días y verde si está al día.
- **API**: el resumen (`GET .../reports/summary`) agrega `averageTicketMinor`, `customerReceivables` (`count`, `totalMinor`: clientes con saldo deudor, por **organización**, porque las cuentas corrientes no son por sucursal) y `cashRegisters` (cada caja activa de la sucursal: `name`, `open`, `expectedAmountMinor`), además de `supplierDebt` (`count` de facturas, `totalMinor`, `overdueMinor`, `todayMinor`, `next7Minor`, `nextDueOn`, por sucursal). La deuda se calcula con el mismo criterio que Cuentas por pagar (`dueSummary`, solo cuenta pagos no anulados). Todo en bigint y sin migraciones. En la web los campos son opcionales: con una API anterior se muestra «—».
- **Alertas de inventario**: Sin stock, Stock bajo, Por vencer (90 días) y Vencidos, con los mismos contadores que Productos (`catalogMetricCounts`). Cada fila lleva a Inventario. Caja y Compras ya no aparecen como alertas porque están en las KPI.
- **Últimas ventas** comparte fila con las alertas (2 columnas desde `lg`).
- **Se quitaron** los ocho accesos rápidos, porque repetían el menú lateral, y los minigráficos de faltantes y vencimientos (`dashboard-inventory-chart`, `dashboard-inventory-bars`).
- **Carga animada, solo con conexión** (`useConectividad`): con conexión, la raíz lleva `dashboard-animado`. Cada bloque entra con un fundido y una subida de 6 px (420 ms, escalonados de a 60 ms). Mientras llega el resumen, las KPI y Últimas ventas muestran esqueletos con un brillo suave, del mismo tamaño que el dato, y el valor aparece con un fundido. **Sin conexión** no hay animación ni brillo: todo aparece directo, porque animar haría sentir más lenta la carga. Con `prefers-reduced-motion` tampoco se anima. Ojo: las clases sin capa de `index.css` (`.dashboard-skeleton`, la regla global de `button`) le ganan a las utilidades de Tailwind; para cambiar la letra de un botón, usar `text-sm!`.

- Indicadores con acentos de color, iconos y números destacados, siguiendo el lenguaje visual de Reportes.
- El rótulo «Sin stock» describe el contador existente; no se agregó un cálculo de stock mínimo.
- Alertas con texto e iconos, sin depender exclusivamente del color. Los estados normales se mantienen visibles con menor peso visual.
- Ocho accesos rápidos con descripción, foco de teclado e iconos de color: Ventas, Compras, Clientes, Cuentas corrientes, Transferencias, Inventario, Caja y Reportes. No se agregan accesos ficticios a recetas.
- Una columna en pantallas pequeñas, dos indicadores desde `sm` y cuatro desde `xl`. Sin datos inventados.

## Rediseño de Inicio

Los KPI usan iconos blancos de 36 px sobre fondos saturados con degradado suave y cifras de 28 px. Son informativos, sin flechas ni redirecciones. Mantienen su ancho y altura compacta, con minigráficos a la derecha del valor. La fecha está inmediatamente a la izquierda del selector de sucursal, en el mismo grupo de la cabecera; el selector, sólo en Inicio, usa altura de 32 px y texto de 11 px como la fecha.

Ventas y Tickets muestran líneas suaves con área degradada de los últimos siete días y variación porcentual respecto de ayer. Las curvas no exceden los valores de sus muestras. La API de resumen agrega únicamente ventas COMPLETED de la organización y sucursal consultadas, en días delimitados por medianoche de Argentina. La comparación es entre hoy acumulado y el día completo de ayer. Si ayer fue cero, se informa «Ayer sin actividad» o «Sin actividad ambos días» en vez de dividir por cero. Los importes y porcentajes se calculan con bigint.

Sin stock muestra barras de faltantes actuales agrupados por categoría (cuatro principales y otras); Vencen pronto muestra lotes por rango de vencimiento: vencidos, hasta 7, 14, 21 y 30 días. Conservan los criterios y contadores existentes, incluido el cómputo de vencidos en el indicador. Son distribuciones actuales, no series históricas ni comparaciones con ayer. Los títulos accesibles describen cada barra; los valores cero no reciben altura artificial.

Los faltantes se presentan como barras horizontales con categoría y cantidad visibles (dos grupos principales, con el resto en el detalle). Los vencimientos conservan cinco intervalos con etiquetas y cantidades; los vencidos se distinguen en rojo. Cero no genera barras decorativas. Los KPI aclaran que el total de vencimientos incluye vencidos. No se cambia la definición de los contadores ni se infiere stock mínimo.

Los cuatro minigráficos tienen detalle propio al pasar el mouse, enfocar con teclado o tocar: encabezado y filas con cantidades/unidades, sin párrafos explicativos ni leyenda «ver detalle» debajo de las barras. No usan el tooltip nativo del navegador. Escape, salir con el mouse o retirar el foco cierran el detalle; el puntero puede entrar al panel sin cerrarlo. No navegan a otros módulos. Incluso con más de ocho categorías, la tarjeta conserva dos barras y el detalle un máximo de cinco filas (cuatro categorías principales y el resto agrupado), sin perder cantidades.

El campo `salesTrend` es opcional en el cliente para compatibilidad con versiones anteriores de la API: sin serie no se muestran gráficos ni porcentajes ficticios. Se requiere actualizar API y frontend para disponer de esta función; no requiere migraciones.

La referencia visual se adapta con cabecera de saludo y sucursal, fecha argentina y una ilustración SVG decorativa local de farmacia. El saludo se actualiza cada minuto, sin fuentes ni imágenes remotas. El buscador conserva sus fuentes, consultas, etiquetas accesibles y resultados, con una presentación compacta.

Las tarjetas de indicadores son más bajas; alertas y accesos forman dos columnas en notebook. Las alertas navegan a Inventario, Compras o Caja según su contenido. No se inventan comparaciones con ayer, gráficos de tendencia, usuarios ni actividad de otros módulos.

Últimas ventas consulta el endpoint existente de ventas de la sucursal y presenta hasta cinco registros ordenados por fecha, con identificador, cantidad de renglones, importe y estado (incluidas anuladas claramente identificadas). Carga, falta de datos y errores se distinguen; no se sustituyen por valores inventados. Ver historial abre Ventas en su pestaña de historial. La respuesta de un contexto anterior se descarta al desmontar/cambiar organización o sucursal.

La tabla de últimas ventas unifica movimiento y descripción en «Venta / comprobante», con icono, identificador y cantidad de artículos. Fecha y hora en líneas separadas, importes alineados y estados con texto e indicador de color. Filas suavemente alternadas y resaltado al pasar el puntero, sin sugerir navegación por fila.

Cambio local de interfaz: no requiere migraciones ni modifica facturación, stock o cobros. Pruebas de renderizado, destinos, saludo en horario argentino y carga sin datos ficticios. Recorrido de navegador con datos simulados a 1366 px y 390 px, sin desbordamiento horizontal de página; tabla móvil con scroll propio. Se verificaron accesos y estado de ventas anuladas.
