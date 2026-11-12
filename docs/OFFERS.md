# Ofertas (SISTEMA-103)

Apartado **Ofertas** para promociones que la venta aplica sola, sin pasos extra
para la cajera. Implementado el 12/11/2026.

## Tipos

| Tipo (`OfferType`) | Qué hace                                                 | Etiqueta     |
| ------------------ | -------------------------------------------------------- | ------------ |
| `PERCENT`          | X % sobre el precio de lista                             | `-20%`       |
| `AMOUNT_OFF`       | $X menos por unidad (nunca por debajo de $0)             | `-$1.500`    |
| `FIXED_PRICE`      | El producto pasa a costar $X (si es más caro, no aplica) | `$5.000`     |
| `BUY_X_PAY_Y`      | Lleva N, paga M; regala la unidad más barata del grupo   | `2x1`, `3x2` |
| `NTH_UNIT_PERCENT` | Una de cada N unidades con X % menos                     | `2da al 50%` |
| `TIERED`           | Escalones: desde N unidades, X % o $X por unidad         | `3+ -15%`    |
| `BUNDLE`           | Productos con sus cantidades a precio total o con un %   | `Combo`      |

Si la oferta tiene un solo día de la semana, la etiqueta lo dice
("Martes -10%"). Las reglas tipo "hoy martes, 10 % en estos productos" son
una oferta de porcentaje con ese día (y franja horaria opcional) sobre la
selección de productos.

Los parámetros son columnas tipadas de `Offer` (`percentBps`, `amountMinor`,
`fixedPriceMinor`, `buyQuantity`, `payQuantity`, `nthUnit`,
`bundlePriceMinor`) más `OfferTier` para los escalones, con un CHECK por tipo
en la base. Un tipo nuevo es un valor del enum, sus columnas y su CHECK: no
hay JSON sin validar.

## Alcance

- Productos, categorías (incluye todas sus subcategorías) y laboratorios
  (`OfferTarget`). Todo lo elegido cuenta junto: un 2x1 sobre un laboratorio
  arma grupos con productos distintos.
- Exclusiones: un destino con `exclude` no entra aunque esté en la categoría o
  el laboratorio.
- `productKind`: todos, sólo medicamentos o sólo no medicamentos. Los
  medicamentos con receta pueden tener oferta (decisión del usuario del
  11/11/2026).
- Combos: sólo productos puntuales, con la cantidad de cada uno.
- Sucursales (`OfferBranch`) y listas de precios (`OfferPriceList`): sin filas,
  aplica a todas.
- Abrir cajas: la caja y el blíster son productos distintos; la oferta de la
  caja no pasa al blíster salvo que se lo agregue.

## Vigencia y estados

- Inicio y fin (`timestamptz`); sin fin, hasta que se pause o finalice.
- Días de la semana (`weekdays`, máscara de bits: bit 0 = domingo) y franja
  (`dayStartMinute`/`dayEndMinute`, minutos de Argentina, UTC-3 sin horario
  de verano).
- Tope por venta (unidades en promoción) y stock de oferta (tope total). El
  tope total se cuenta con `SaleOffer` de ventas no anuladas y se bloquea la
  fila de la oferta (`FOR UPDATE`) al confirmar: dos ventas a la vez no lo
  pasan.
- Estado guardado: `DRAFT`, `PUBLISHED`, `PAUSED`, `FINISHED`, `ARCHIVED`. El
  estado vigente se calcula con la fecha y la hora, sin cron: Borrador,
  Programada, Activa, Pausada, Vencida, Finalizada, Archivada.
- Acciones: publicar, pausar, reanudar, finalizar ya, duplicar (queda en
  borrador) y archivar. Una oferta nunca se borra. Una finalizada o archivada
  no se edita (se duplica). Una oferta usada en ventas no cambia de tipo.
- La edición sube `version` y exige `expectedUpdatedAt` (409 si otra persona
  la cambió).

## Combinación y orden de cálculo

1. Precio de lista efectivo (lista del cliente, su respaldo o Precio general).
2. Precio especial de la cajera: **reemplaza la oferta**. Ese renglón no
   recibe ofertas ni cuenta para un grupo.
3. Ofertas. Cada renglón recibe como máximo una, la de mayor ahorro, salvo
   que todas las que lo tocan sean combinables: ahí se suman en orden sobre
   el precio ya ofertado. Se elige de a una oferta: la de mayor ahorro total;
   a igual ahorro, mayor prioridad y después la más antigua. Es determinista,
   pero con grupos mixtos no siempre es el óptimo global.
4. Descuento general del pie, sobre el subtotal ya ofertado; no puede
   superarlo.
5. Reparto entre lotes (FEFO): la oferta y el descuento general se reparten
   por separado, proporcional a las unidades, con el remanente en el último
   lote.

Redondeo: cada renglón se calcula como fracción exacta y se redondea una sola
vez a centavos (mitad hacia arriba). Nunca un renglón negativo. Conceptos
manuales: nunca reciben ofertas.

## Motor

`apps/api/src/offers/ofertas-motor.ts` es puro (sin base ni dependencias) y es
**el mismo archivo** que `apps/web/src/lib/ofertas-motor.ts`. Un test de la
web compara los dos: si se cambia uno, se copia al otro. La API es la
autoridad; la web lo usa para la vista previa del carrito, la marca en el
catálogo, el alta (vista previa "un producto de $10.000 queda en $8.000") y
la venta sin conexión.

## Venta (API)

- `POST sales` recibe en cada renglón `expectedOfferDiscountMinor` (el ahorro
  que vio la cajera) y `discountMinor` (sólo el descuento general).
- La API carga las ofertas publicadas, calcula y compara. Si no coincide
  (venció, empezó, cambió o el tope se agotó), responde **409** con
  `code: "OFERTAS_CAMBIARON"` y el cálculo nuevo; la web actualiza las
  ofertas y la cajera reconfirma.
- `SaleItem.discountMinor` sigue siendo el descuento total del renglón;
  `SaleItem.offerDiscountMinor` es la parte de ofertas (CHECK: no la supera).
  Por eso factura, nota de crédito, cuenta corriente y tickets no cambian.
- Instantánea: `SaleOffer` (oferta, versión, nombre, etiqueta, tipo,
  parámetros, unidades y descuento) y `SaleOfferItem` (producto, unidades,
  importe de lista y descuento). Un cambio posterior de la oferta no altera
  ventas, tickets, facturas ni notas de crédito.
- La auditoría `COMPLETED` de la venta incluye las ofertas aplicadas y el
  `offerDiscountMinor` de cada renglón.

## Sin conexión

- Las ofertas activas y programadas (`GET offers/vigentes`) quedan en la copia
  local; la precarga de Ventas las baja con conexión.
- La PC aplica el motor con la hora local y manda el ahorro cobrado y las
  ofertas aplicadas (`appliedOffers`).
- Al sincronizar, el servidor calcula con la hora de la venta. Si coincide,
  usa su cálculo. Si no (por ejemplo, la oferta se finalizó a mano antes de
  sincronizar), **respeta lo cobrado**, arma la instantánea con lo que declaró
  la PC (si son ofertas de la farmacia y suman lo cobrado) y deja el aviso
  `OFERTA_DISTINTA`. Un stock de oferta superado deja `TOPE_OFERTA_SUPERADO`.
  Una oferta que venció por fecha después de la venta pero estaba vigente a
  esa hora se respeta sin aviso.
- Las ofertas sólo se crean y editan con conexión.

## Fiscal y tickets

- Factura C: ARCA recibe `ImpTotal`/`ImpNeto` ya con el descuento; la
  instantánea fiscal conserva el detalle por renglón con `discountMinor`.
- Nota de crédito: prorratea `discountMinor` por unidad (remanente a la
  última). Devolver 1 unidad de un 2x1 devuelve la mitad de lo pagado.
- Ticket 80 mm, ticket web y A4: un renglón por oferta ("OFERTA 2x1
  Shampoo − $X"), el resto como "DESCUENTO" y "USTED AHORRÓ $X". El contrato
  suma `offerDiscountMinor`, `offers` y `savingsMinor`; `discountMinor` sigue
  siendo el total, así un agente de impresión anterior imprime cuentas
  correctas sin el detalle.

## Permisos y auditoría

- `OFFER_READ` (ver ofertas y sus ventas) y `OFFER_MANAGE` (crear, editar y
  cambiar estado). La migración los da a los roles con `CATALOG_READ` y
  `CATALOG_MANAGE`; el alta de farmacias, a dueño y administrador, y
  `OFFER_READ` también al rol Empleado.
- Aplicar una oferta en una venta no requiere permiso extra.
  `GET offers/vigentes` acepta `SALE_READ`, `CATALOG_READ` u `OFFER_READ`.
- Auditoría transaccional (`entityType = OFFER`): `OFFER_CREATED`,
  `OFFER_UPDATED` (antes y después), `OFFER_PUBLISHED`, `OFFER_PAUSED`,
  `OFFER_RESUMED`, `OFFER_FINISHED`, `OFFER_ARCHIVED`, `OFFER_DUPLICATED`.

## Web

- Ofertas (`?pagina=ofertas`): listado con filtros (estado, tipo, sucursal,
  búsqueda por nombre o producto), columnas de vigencia, sucursales, estado,
  ventas, unidades y descuento otorgado; alta y edición en 5 pasos con
  escáner; detalle con historial y ventas; acciones.
- Ventas: etiqueta y ahorro por renglón, subtotal tachado, aviso "Agregá 1
  más y llevás 3x2", "Ahorro por ofertas" en el pie y en el cobro, "El
  cliente ahorró" en la venta confirmada, marca en el catálogo y en el
  detalle del producto. Si el ahorro cambia sin que cambie el carrito (venció
  una oferta, se reanudó la venta), se avisa.
- Productos: etiqueta "En oferta"/programada en la fila, filtro "Con oferta
  vigente", ofertas del producto en el editor y "Crear oferta para este
  producto".
- El aviso de "por debajo del costo" se muestra en el resumen del alta (con
  permiso de costos), con el costo del lote más reciente de la sucursal; no
  bloquea.

## Reportes

`GET offers/reporte` (permiso `OFFER_READ` o `REPORT_READ`) y las columnas
del listado: por oferta, ventas, unidades, descuento otorgado y facturación
(importe de lista menos la oferta de las unidades en promoción, antes del
descuento general). Excluye ventas anuladas. Filtros de fecha y sucursal.
Queda listo para sumarlo a `REPORTS_PLAN.md`.

## Fuera de esta versión

- Condición por medio de pago y por cliente puntual (sólo listas de precios).
- Crear o editar ofertas sin conexión.
- Reporte interactivo de ofertas en Reportes.
