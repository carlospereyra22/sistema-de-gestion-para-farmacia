# Notas de crédito

SISTEMA-110 (21/11/2026). Decisiones del usuario: la nota de crédito sirve para
la venta entera o para productos; existe para factura real, factura de prueba y
comprobante interno (nota interna); el stock se elige en cada nota; y todo se
hace en un solo paso, devolución de plata incluida.

## Dónde se hace

Ventas → Historial → detalle de la venta → **Nota de crédito**. El diálogo
sirve sólo para hacerla:

- Lista los productos con lo que queda sin devolver. Se tilda cada producto
  (o "Toda la venta") y, si quedan varias unidades, se ajusta con − / +.
- **Vuelve al stock / Queda apartada**, una elección para toda la nota (de
  entrada, vuelve): repone las unidades en el lote de la venta. Apartada, la
  devolución queda registrada pero no suma stock vendible (vencido, roto,
  abierto). Los conceptos y los renglones vendidos sin lote (sin stock al
  sincronizar) nunca se reponen.
- Motivo (3 a 300 caracteres).
- **Devolvés en**: efectivo (sale de una caja abierta de la sucursal), tarjeta
  o transferencia (se registra lo que el operador devuelve por fuera) o, si la
  venta tiene cliente registrado, **Saldo a favor**. Se sugiere el medio con
  que se pagó.
- Factura real: casilla de confirmación de que se emite una nota C real.
- Sólo scrollea la lista de productos; los desplegables de abajo abren hacia
  arriba sin cortarse.
- Al terminar muestra cuánto devolver, el estado en ARCA, **Imprimir** y
  **Listo**.

## Dónde se ven

Ventas → Historial tiene dos secciones, como Administración: **Ventas** y
**Notas de crédito**. La de notas usa los mismos filtros (fechas, cliente,
tipo, código de la nota o de la venta), tabla y paginación que ventas. Tocando
una fila se ve el detalle (productos, devolución, mercadería, motivo, estado en
ARCA) con **Imprimir** y, si ARCA no la autorizó, **Consultar ARCA** o **Volver
a emitir**. En la tabla de ventas, las que tienen nota dicen "Con nota de
crédito".

Los dos historiales filtran por **cliente** (uno puntual o "Público general";
`customerId` = uuid o `SIN_CLIENTE`).

La anulación sigue aparte ("Anular la venta"), para ventas sin devoluciones.
El botón "Devolver" anterior (devolución sin plata ni stock) se quitó.

## Qué pasa al confirmar

Una sola transacción serializable, idempotente por `requestId`:

1. Bloquea la venta y controla que las cantidades no superen lo que queda.
2. Importe por renglón: el descuento de la venta (ofertas incluidas) se
   prorratea por acumulado; el último centavo va a la última unidad. Devolver
   1 de un 2x1 devuelve la mitad de lo pagado (`sales/nota-credito.ts`).
3. Si la venta fue a cuenta corriente, primero baja lo que se debe de esos
   artículos (movimiento CREDIT con asignación por artículo, "no es un cobro").
   Pide conciliar antes si hay cobros sin asignar o financiación mixta.
4. El resto se devuelve en plata. Efectivo: salida de caja
   `Nota de crédito <id>: <motivo>` (categoría CREDIT_NOTE del cierre).
5. Repone stock de lo marcado: suma al lote y deja un movimiento
   `CUSTOMER_RETURN` que referencia la nota. Reabre el producto en la sucursal
   si estaba archivado, como la anulación.
6. Registra la devolución (`CustomerReturn` con `creditKind`, importes, medio y
   caja; `CustomerReturnItem` con importe y si se repuso) y la auditoría
   `NOTA_CREDITO`.
7. Si la venta se facturó, deja la nota C (13) en cola:
   - Factura real → `FiscalDocument` CREDIT_NOTE, ya liquidada (`settledAt`).
   - Factura de prueba → `FiscalTrial` kind CREDIT_NOTE (`creditSaleId`,
     `originalId`).

Después de confirmar se envía a ARCA con el comprobante asociado
(`CbtesAsoc`: la factura original). Si ARCA no responde o rechaza, la devolución
ya está hecha: la nota queda en cola (la cola fiscal la reintenta) o rechazada
(se vuelve a emitir con número nuevo, sin repetir la devolución).

## Saldo a favor

Decisión del usuario (21/11/2026): con cliente registrado, lo que se acredita
puede quedar en su cuenta corriente en vez de devolverse en plata.

- Primero baja la deuda de los artículos de esa venta (como siempre), después
  la de sus otras compras a cuenta, de la más vieja a la más nueva.
- Lo que sobra queda **a favor** y se descuenta solo la próxima vez que el
  cliente compra a cuenta corriente (al confirmar la venta, también las que
  llegan sin conexión). Si sigue sobrando, sigue a favor.
- Se guarda como un crédito de cuenta corriente con
  `allocations = {kind: "SALDO_A_FAVOR", notaId, items}`: `items` son las
  imputaciones que se van sumando y lo no imputado es el saldo disponible
  (`accounts/item-allocations.ts`, `AccountsService.aplicarSaldoAFavor`). No
  cuenta como "cobro sin asignar": no pide conciliación ni deja la cuenta "Por
  revisar", y no se puede asignar a mano.
- La nota guarda todo en `accountMinor` (cuenta corriente), `refundMinor` 0 y
  sin medio. No mueve caja.
- Una compra mixta (parte contado, parte cuenta) sin conciliar no recibe el
  saldo hasta que se concilia y llega otra compra a cuenta u otra nota.

## Cuándo no se puede

- Venta anulada.
- Venta facturada cuya factura todavía no está autorizada: si no llegó a ARCA
  (en cola, en espera de caja o rechazada) se anula la venta; si está esperando
  respuesta, se espera.
- Cantidades mayores a lo que queda, o efectivo sin caja abierta.

## Comprobantes

- Nota interna: ticket del navegador "NOTA DE CRÉDITO INTERNA · NO VÁLIDO COMO
  FACTURA", con total acreditado y forma de devolución. No va a ARCA ni a la
  impresora térmica directa.
- Nota C: el mismo ticket fiscal de la factura, con "Factura asociada"; la de
  prueba dice "SIN VALIDEZ FISCAL".

## Reportes y caja

Las ventas netas, unidades y categorías ya restan las devoluciones
(`CustomerReturn`), así que la nota baja las ventas del día en que se hace. El
efectivo devuelto aparece como salida en la caja.

## API

Bajo `organizations/:organizationId/branches/:branchId/sales/:saleId`:

- `GET notas-credito` (SALE_READ): tipo de nota, productos con lo disponible y
  notas hechas.
- `GET sales/notas-credito` (SALE_READ, sin `:saleId`): listado paginado de la
  sucursal con `from`, `to`, `creditKind`, `customerId`, `q`, `page`,
  `pageSize`. `GET sales/history` acepta también `customerId` y devuelve
  `notasCredito` (cantidad) por venta.
- `POST notas-credito` (SALE_MANAGE): `requestId`, `reason`,
  `items[{saleItemId, quantity, reponer}]`, `refundMethod` (CASH, CARD,
  TRANSFER o SALDO_A_FAVOR), `cashSessionId`, `confirmProduction`.
- `POST notas-credito/:notaId/procesar` y `.../reencolar` (SALE_MANAGE): envía o
  consulta, o vuelve a emitir la rechazada.

Se quitaron `GET/POST sales/:saleId/credits` (nota productiva en dos pasos).
`credits/:documentId/process` y `credits/:documentId/settlement` quedan sólo
para notas productivas anteriores sin liquidar; la web ya no los usa.
`POST customer-returns` (devolución sin plata ni stock) sigue en la API pero la
web ya no lo usa.

## Nombres en el historial

`GET sales/history` devuelve `productName` en cada renglón. La web carga el
catálogo por partes y, sin esto, el detalle de una venta mostraba "Producto
histórico" para lo que no estaba cargado.

## Pendiente

- Sin conexión: la nota se hace sólo con conexión.
- Imprimir la nota interna por el agente térmico directo (hoy, navegador).
