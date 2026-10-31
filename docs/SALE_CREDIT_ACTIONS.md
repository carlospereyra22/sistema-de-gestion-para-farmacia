# Acceso a notas de crédito desde Historial

El detalle conserva la tabla de productos y agrupa los medios de pago registrados en etiquetas con iconos debajo de ella. No interpreta pagos brutos como netos ni calcula saldos nuevos. El panel lateral muestra total histórico, tipo de comprobante y estado comercial (no autorización fiscal), luego impresión y menú fiscal. Anulación y devolución mantienen sus manejadores y motivo, dentro de un desplegable inicialmente cerrado para evitar competir con las acciones de consulta. Las ventas anuladas conservan su aviso y no muestran esas acciones.

En Ventas → Historial → detalle de una venta facturada se consulta la factura con GET. Sólo una factura de producción autorizada muestra el menú de tres puntos junto a «Ver / imprimir factura». La consulta no procesa ni reenvía comprobantes. Un error permite reintentar la consulta sin habilitar acciones por defecto.

- «Emitir nota de crédito» abre un diálogo con el formulario existente de cantidades y motivo. Abrir el diálogo no emite: se conserva la confirmación explícita de producción y el envío manual.
- «Ver notas de crédito» abre el listado sin el formulario de emisión. Desde allí se puede preparar una nueva nota o consultar y liquidar las existentes con las confirmaciones previas.
- Se conserva el acceso anterior desde la factura y no se agregan controles al cobro de ventas.
- El diálogo de notas utiliza la capa modal nativa sobre el detalle de venta. Escape cierra sólo el diálogo de notas; el menú admite Escape y cierre al pulsar fuera.

No cambian endpoints de escritura, permisos del servidor, cálculos, reservas, idempotencia, reintegros ni recepción de mercadería. El servidor sigue revalidando las operaciones. La función continúa restringida a producción; no se habilita emisión real en pruebas.

Validación automatizada de presentación y consulta GET. Pendiente prueba manual de apertura, foco y cierre en navegador; no se emitieron comprobantes para probar este cambio.
