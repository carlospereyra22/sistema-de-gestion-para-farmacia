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

## Datos disponibles y faltantes

| Metrica                    | Fuente                                              | Estado                         |
| -------------------------- | --------------------------------------------------- | ------------------------------ |
| Ventas, tickets, unidades  | `Sale` (COMPLETED, `completedAt`), `SaleItem`       | Completo                       |
| Devoluciones               | `CustomerReturn` + `CustomerReturnItem`             | Completo                       |
| Medios de pago (mixtos)    | `SalePayment.method/amountMinor`                    | Completo                       |
| Costo de ventas / margen   | `SaleItem.lotId -> ProductLot.unitCostMinor`        | Estimado (solo items con lote) |
| Categoria / laboratorio    | `Product.categoryId/laboratoryId`                   | Completo                       |
| Stock actual y valor       | `ProductLot.quantity * unitCostMinor`               | Completo                       |
| Stock historico            | Reconstruir con `InventoryMovement.occurredAt`      | A validar                      |
| Vencimientos               | `ProductLot.expiresAt`                              | Completo                       |
| Compras / recepciones      | `Purchase`, `PurchaseItem`, `PurchaseReceipt(Item)` | Completo                       |
| Facturas proveedor         | `SupplierPayableInvoice/Due/Payment/Allocation`     | Completo                       |
| Cuenta corriente / cobros  | `CustomerAccountMovement`, `Sale.accountDueDate`    | Completo                       |
| Vendedor/cajero            | No existe en `Sale`                                 | No disponible                  |
| Stock minimo               | No existe                                           | Umbral configurable            |
| Tipo de cliente / deposito | No existen                                          | No disponible                  |

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
