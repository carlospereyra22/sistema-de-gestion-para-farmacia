# Reportes interactivos - plan de tareas

Especificacion completa: `docs/REPORTS_INTERACTIVE_SPEC.md`.
Referencias visuales (no versionadas, ~12 MB): `C:\reportes\REFERENCIAS_VISUALES\`.
Las imagenes son guia de composicion; los colores son los del sistema (verde/teal
`#087f70`, `#008b7c`, `#31826a`, bordes `#dce7ef`, cards como `.cash-card`), no el
verde de las imagenes ni el azul `#315da8` que usa hoy la pantalla de Reportes.

## Punto de partida (31/10/2026)

- API: `apps/api/src/reports/` con `GET .../branches/:branchId/reports/summary` y
  `.../detail?from&to`. Permiso `REPORT_READ`. Solo una sucursal por consulta.
- Web: funcion `Reports` dentro de `apps/web/src/workspace-shell.tsx` (una pantalla,
  4 KPIs, top productos, medios de pago). Sin libreria de graficos.

## Mapa de metricas (SISTEMA-2, 31/10/2026)

Fuente unica para todas las pestanas: tarjetas, graficos, tablas y exportaciones usan
estas definiciones. Tipos compartidos en `packages/contracts/src/reports.ts`.

### Reglas comunes

- **Periodo**: `from`/`to` son fechas civiles de Argentina, ambas inclusivas para el
  usuario. La API consulta `[from 00:00 -03:00, to+1 00:00 -03:00)`. Por defecto,
  ultimos 30 dias. Rango maximo 366 dias.
- **Comparacion**: `previous` = periodo anterior de igual duracion; `yearAgo` = mismas
  fechas del ano anterior; `none`. Si el valor anterior es 0 o falta, `changePct` es
  `null` y la UI muestra "Sin base de comparacion".
- **Sucursal**: `branchId` de una sucursal autorizada o `"all"`. `"all"` = sucursales
  activas del usuario (`UserBranch`) al momento de consultar: una sucursal nueva aparece
  sola. La UI muestra "Todas las sucursales" + nombres solo si hay 2 o mas; con 1, su
  nombre.
- **Dinero**: centavos enteros como string (`"123456"` = $1.234,56), como el resto de la
  API. Nunca float. Formato `es-AR`/ARS solo en la UI.
- **Ventas validas**: `Sale.status = COMPLETED`, fecha `completedAt`. `DRAFT` y
  `CANCELLED` (anuladas) se excluyen siempre.
- **Unidades**: `SaleItem.quantity` esta en la unidad de venta de cada producto
  (`Product.saleUnit`: caja, blister o unidad). No hay conversion: la UI dice "unidades
  de venta".

### Ventas

| Metrica              | Formula y fuente                                                                                                                                                                                               | Limitacion                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Ventas brutas        | `Σ SaleItem.unitPriceMinor × quantity` de ventas validas                                                                                                                                                       | `unitPriceMinor` ya incluye el descuento especial por producto |
| Descuentos           | `Σ SaleItem.discountMinor`. Incluye el descuento general, que la web reparte en las lineas (`apps/web/src/lib/sale-discount.ts`)                                                                               | No se separa descuento de linea y descuento general            |
| Ventas facturadas    | `Σ Sale.totalMinor` = brutas − descuentos                                                                                                                                                                      |                                                                |
| Devoluciones         | Por `CustomerReturnItem`: `(unitPriceMinor × quantity − discountMinor) × cantidadDevuelta / quantity` del `SaleItem`. Fecha `CustomerReturn.createdAt`: se restan en el periodo en que ocurren                 | No guardan importe; se calcula con el precio neto de la linea  |
| **Ventas netas**     | Ventas facturadas − devoluciones del periodo                                                                                                                                                                   |                                                                |
| Tickets              | Cantidad de ventas validas. Una venta devuelta por completo sigue contando                                                                                                                                     |                                                                |
| Ticket promedio      | Ventas facturadas / tickets; `null` sin tickets                                                                                                                                                                |                                                                |
| Unidades vendidas    | `Σ SaleItem.quantity` de lineas con producto, menos unidades devueltas                                                                                                                                         | Mezcla cajas, blisteres y unidades                             |
| Ventas por dia/hora  | Ventas facturadas por `completedAt` en hora de Argentina                                                                                                                                                       |                                                                |
| Ventas por medio     | `Σ SalePayment.amountMinor` por `method`, restando el vuelto al efectivo: `vuelto = Σ pagos − Sale.totalMinor`. `ACCOUNT` = vendido a cuenta corriente, no es cobro. La suma de los medios = ventas facturadas | Ver nota del vuelto abajo                                      |
| Por categoria / lab. | Linea neta (`unitPriceMinor × quantity − discountMinor`) por `Product.categoryId` / `laboratoryId`. El filtro de categoria incluye descendientes                                                               | Conceptos manuales (sin producto) van a "Sin producto"         |
| Por sucursal         | `Sale.branchId` de la venta, no la sucursal actual del usuario                                                                                                                                                 |                                                                |
| Por vendedor         | **No disponible**: `Sale` no guarda quien vendio                                                                                                                                                               | Requiere registrar el dato a futuro                            |

Nota del vuelto (probado 31/10/2026 en local): `SalePayment` guarda lo que entrego el
cliente. El vuelto se registra aparte: `CashMovement` OUT con caja abierta, o
`CashPendingCollection.changeMinor` sin caja. Venta de $1.980 pagada con $2.000: la
pantalla actual de Reportes muestra Facturacion $1.980 y Efectivo $2.000. Los reportes
nuevos usan la formula de arriba. La pantalla vieja queda sin corregir hasta que se
reemplace.

### Rentabilidad

| Metrica             | Formula y fuente                                                                                     | Limitacion                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Costo de ventas     | `Σ ProductLot.unitCostMinor × SaleItem.quantity` via `SaleItem.lotId`, menos el costo de lo devuelto | **Estimado**: usa el costo actual del lote (si se corrigio, el corregido). Lineas sin lote no tienen costo y se excluyen |
| Ganancia bruta      | Ventas netas con costo − costo de ventas                                                             | No es ganancia neta: no descuenta sueldos, alquiler ni impuestos                                                         |
| Margen bruto %      | Ganancia bruta / ventas netas con costo × 100. Ponderado por importe, nunca promedio de porcentajes  |                                                                                                                          |
| Cobertura de costo  | Ventas netas con costo / ventas netas × 100. Indica cuanto de la venta tiene costo conocido          |                                                                                                                          |
| Ganancia por ticket | Ganancia bruta / tickets                                                                             |                                                                                                                          |
| Variacion de margen | Margen actual − margen anterior en **puntos porcentuales** (`pp`), separada de la variacion %        |                                                                                                                          |

### Productos

| Metrica           | Formula y fuente                                                                                                                                   | Limitacion                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Productos activos | `Product.active = true`, sin los archivados de la sucursal (`ProductBranchState`)                                                                  |                                     |
| Top vendidos      | Por unidades, ventas netas o ganancia (selector), nunca mezclados                                                                                  |                                     |
| Sin movimiento    | Productos activos con stock > 0 sin ventas en los ultimos **N dias** (por defecto 30, editable)                                                    |                                     |
| Rotacion          | Unidades vendidas / stock promedio del periodo, reconstruido con `InventoryMovement`. Si no se puede, usa el stock actual y se rotula "aproximada" | Aproximada hasta validar el calculo |

### Inventario

| Metrica               | Formula y fuente                                                                                                                     | Limitacion                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Stock actual          | `Σ ProductLot.quantity` por producto y sucursal. Fisico incluye vencidos; vendible los excluye                                       |                                                      |
| Valor del stock       | `Σ ProductLot.quantity × unitCostMinor`. Valor a costo, no a precio de venta                                                         |                                                      |
| Stock bajo            | Stock vendible > 0 y ≤ umbral (por defecto **5**, editable)                                                                          | No existe minimo por producto; el umbral es uno solo |
| Sin stock             | Productos activos de la sucursal con stock vendible = 0                                                                              |                                                      |
| Vencidos / por vencer | Lotes con `quantity > 0`: vencido si `expiresAt` < hoy; por vencer dentro de la ventana (30/60/90; por defecto 90, igual que Ventas) | Lotes sin vencimiento no cuentan                     |
| Evolucion del stock   | Solo si se reconstruye con `InventoryMovement` (fuente historica). Si no, "Historico no disponible"                                  | A validar en la pestana Inventario                   |
| Deposito              | **No disponible**: no hay depositos dentro de una sucursal                                                                           |                                                      |

### Compras y proveedores

| Metrica                | Formula y fuente                                                                                                                               | Limitacion                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Compras recibidas      | `Σ PurchaseReceiptItem.quantity × unitCostMinor` por `PurchaseReceipt.createdAt`. Metrica principal: lo que entro                              | No incluye pedidos sin recibir          |
| Facturado proveedores  | `Σ SupplierPayableInvoice.amountMinor` por `issuedOn`. Se muestra separado de lo recibido; nunca se suman                                      | Solo facturas cargadas en el sistema    |
| Facturas pendientes    | Por cuota: `SupplierPayableDue.amountMinor − Σ allocations` de pagos con `voidedAt = null`. Vencida si `dueOn` < hoy (vence hoy no es vencida) |                                         |
| Recepciones pendientes | Por `PurchaseItem`: `orderedQuantity − receivedQuantity − cancelledQuantity` > 0, en compras `ORDERED` o `PARTIALLY_RECEIVED`                  |                                         |
| Aumento de costo       | Por producto: ultimo `PurchaseReceiptItem.unitCostMinor` del periodo vs. ultimo anterior al periodo                                            | Solo productos con recepciones en ambos |
| Proveedores activos    | Proveedores con al menos una recepcion o factura en el periodo                                                                                 |                                         |

### Clientes y cuentas corrientes

| Metrica                | Formula y fuente                                                                                                                                                | Limitacion                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Clientes con compras   | Clientes distintos con ventas validas en el periodo                                                                                                             |                                                         |
| Saldo cuenta corriente | `Σ DEBIT − Σ CREDIT` de `CustomerAccountMovement`, por cliente y sucursal del movimiento                                                                        |                                                         |
| Clientes con deuda     | Clientes con saldo > 0                                                                                                                                          |                                                         |
| Cobrado en el periodo  | `Σ CREDIT` **con `paymentMethod`** por `createdAt`. Los creditos sin medio son anulaciones o notas de credito fiscales: bajan la deuda pero no son cobros       |                                                         |
| Antiguedad de saldos   | Saldo pendiente por venta segun `Sale.accountDueDate`: al dia, 1–30, 31–60, 61–90, 91–120 y >120 dias de atraso. Atrasada desde el dia siguiente al vencimiento | Ventas sin fecha de vencimiento van a "Sin vencimiento" |
| Top clientes           | Ventas facturadas por `Sale.customerId`. No suma cobros                                                                                                         |                                                         |
| Tipo de cliente        | **No disponible**: no existe clasificacion de clientes                                                                                                          |                                                         |

Privacidad: DNI, CUIT y telefono no se muestran en vistas generales ni exportaciones.

### Permisos

| Que se ve                                                    | Permiso                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Reportes de ventas, productos e inventario                   | `REPORT_READ` (existente)                                        |
| Costos, ganancia y margen (Rentabilidad y columnas de costo) | Nuevo `REPORT_PROFIT_READ`: "Ver costos y ganancias en reportes" |
| Compras y proveedores                                        | `REPORT_READ` + `PURCHASE_READ` (existente)                      |
| Clientes y cuentas corrientes                                | `REPORT_READ` + `ACCOUNT_READ` (existente)                       |
| Exportar                                                     | Nuevo `REPORT_EXPORT`: "Exportar reportes"                       |

Los permisos nuevos se crean en SISTEMA-3 (migracion `20261031000000_report_permissions`,
seed y bootstrap de produccion) y se asignan a OWNER y ADMIN; el dueno los ajusta por
rol en Configuracion → Roles y permisos.

## API base (SISTEMA-3)

- Rutas nuevas a nivel organizacion: `organizations/:organizationId/reports/...`, solo
  con `JwtAccessGuard`. No usan `BranchAccessGuard` porque pueden abarcar varias
  sucursales: cada endpoint llama a `ReportAccessService.scope()`, que valida permiso y
  sucursales contra `UserBranch`. Las rutas viejas
  `organizations/:organizationId/branches/:branchId/reports/{summary,detail}` siguen
  igual (las usa Inicio).
- `GET organizations/:organizationId/reports/filter-options` → `ReportFilterOptions`:
  sucursales activas asignadas, categorias, laboratorios, proveedores (solo con
  `PURCHASE_READ`) y `access` con lo que el usuario puede ver.
- `ReportFiltersQuery` (`apps/api/src/reports/report-filters.dto.ts`): DTO comun de
  filtros para los endpoints de cada pestana. Listas como `?categoryIds=a,b`.
- `parseReportPeriod` (`report-period.ts`): fechas → `[start, end)` en hora de
  Argentina, periodo de comparacion, validaciones (400 con mensaje en espanol): fecha
  invalida, Desde > Hasta, Hasta futura, mas de 366 dias.
- Errores: sin `REPORT_READ` o sucursal no autorizada → 403.
- Tests: `report-period.spec.ts` y `test/report-access.integration.spec.ts`
  (aislamiento entre sucursales y organizaciones, sucursal nueva, inactivas, permisos).

## Web base (SISTEMA-4)

- `reports-workspace.tsx`: titulo "Reportes" en la barra superior (sin encabezado
  grande), 7 pestanas compactas (las restringidas muestran candado), barra de filtros y
  contenido de la pestana activa. La vista vive en la URL: `seccion` (pestana),
  `periodo`, `desde`, `hasta`, `sucursal`, `comparar`; al cambiar de pantalla se borran.
- `report-filters-bar.tsx`: periodo (Hoy … Este ano, Personalizado), Desde/Hasta siempre
  editables (al tocarlas pasa a Personalizado y aplica si el rango es valido), sucursal
  ("Todas las sucursales" solo con 2 o mas), comparar con y Restablecer. Usa el
  desplegable del sistema (`ProductFilterSelect`), no el `select` nativo.
- Componentes: `report-kpi.tsx` (valor, variacion con color segun si subir es bueno,
  ayuda de la formula, "estimado"), `report-states.tsx` (vacio, error con reintento,
  carga), `report-chart.tsx` (ECharts). Logica en `lib/report-view.ts`,
  `lib/report-format.ts`, `lib/report-chart-theme.ts`, `lib/reports-api.ts`.
- Resumen muestra por ahora la vista anterior (`report-legacy-overview.tsx`) con las
  fechas de la barra; consulta una sucursal por vez (con "Todas" usa la del encabezado
  y lo avisa). Su cuarta tarjeta es "Unidades vendidas" (`unitsSold` agregado a
  `reports/detail`). La reemplaza SISTEMA-5.
- **ECharts** (`echarts@6.1.0`, Apache-2.0): imports modulares y carga diferida; queda
  en su propio archivo (`report-chart-*.js`) que se descarga solo al abrir Reportes.
  Produccion: no requiere instalacion manual. `Publicar Produccion.cmd` lo instala con
  `pnpm install --frozen-lockfile` y lo incluye en el build de `SUBIR-A-NETLIFY`; el
  servidor Oracle instala solo dependencias de la API. Despues de traer el cambio,
  cada desarrollador corre `pnpm install` una vez.

## Tareas

1. **Mapa de metricas y contratos.** Matriz metrica -> fuente -> formula -> limitaciones;
   tipos de filtros y respuestas en `packages/contracts`.
2. **Base API de reportes.** DTO de filtros (rango `[desde, hasta)` en hora Argentina,
   sucursal o todas las autorizadas, comparacion), autorizacion multi-sucursal y
   permisos (`REPORT_READ` + nuevos para rentabilidad, clientes y exportar).
3. **Base web de reportes.** Sacar `Reports` de `workspace-shell.tsx` a archivos
   `report-*.tsx`, 7 pestanas compactas, barra de filtros, `ReportKpi`, estados
   vacio/error/carga, formato ARS `es-AR`, tema ECharts con la paleta actual.
4. **Pestana Resumen.**
5. **Pestana Ventas** (por dia, por hora, mapa de calor, medios de pago, sucursales).
6. **Pestana Rentabilidad** (costo por lote, margen ponderado, rotulado "estimado").
7. **Pestana Productos** (top, sin movimiento, rotacion vs margen).
8. **Pestana Inventario** (valor, stock bajo/sin stock, vencimientos, stock critico).
9. **Pestana Compras** (por proveedor, facturas pendientes, recepciones pendientes,
   aumento de costos).
10. **Pestana Clientes** (saldos, cobranzas, antiguedad, mayores deudores, ultimos cobros).
11. **Interaccion.** Filtros cruzados, drill-down de tiempo y categoria, `DrilldownDrawer`
    con detalle paginado y links a la operacion original.
12. **Exportacion.** CSV (con proteccion de formulas), XLSX y vista de impresion/PDF,
    revalidando permisos en backend.
13. **Rendimiento y cierre.** Indices necesarios, tests de negocio (pagos mixtos,
    devoluciones, recepciones parciales, aislamiento de sucursales), responsive,
    documentacion y `cerrar-tarea`.

Opcional posterior: "Mis tableros".
