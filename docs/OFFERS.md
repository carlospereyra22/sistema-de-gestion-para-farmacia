# Ofertas (SISTEMA-103)

Apartado **Ofertas** para promociones que la venta aplica sola, sin pasos extra
para la cajera. Implementado el 12/11/2026.

## Tipos

| Tipo (`OfferType`) | Qué hace                                                 | Etiqueta              |
| ------------------ | -------------------------------------------------------- | --------------------- |
| `PERCENT`          | X % sobre el precio de lista                             | `-20%`                |
| `AMOUNT_OFF`       | $X menos por unidad (nunca por debajo de $0)             | `-$1.500`             |
| `FIXED_PRICE`      | El producto pasa a costar $X (si es más caro, no aplica) | `$5.000`              |
| `BUY_X_PAY_Y`      | Lleva N, paga M; regala la unidad más barata del grupo   | `2x1`, `3x2`          |
| `NTH_UNIT_PERCENT` | Una de cada N unidades con X % menos                     | `2da al 50%`          |
| `TIERED`           | Escalones: desde N unidades, X % o $X por unidad         | `3+ -15%`             |
| `BUNDLE`           | Productos con sus cantidades a precio total o con un %   | `Combo`               |
| `PAYMENT_METHOD`   | X % pagando con ciertos medios, proporcional a lo pagado | `-10% efectivo`       |
| `SPEND_THRESHOLD`  | Desde $X de compra, X % o $X menos (una vez por venta)   | `Desde $100.000 -10%` |

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
- Todos los productos (`Offer.allProducts`): la oferta vale para todo el
  catálogo, con las exclusiones de `OfferTarget` (lo elegido sólo puede ser
  exclusión) y respetando `productKind`. No se permite en combos (CHECK).
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
- Acciones: publicar, pausar, reanudar, finalizar ya y archivar. Una oferta
  nunca se borra. Una finalizada o archivada no se edita: se crea una nueva.
  La web no ofrece «Duplicar» (12/11/2026: no aportaba nada); el endpoint de
  la API sigue existiendo. Una oferta usada en ventas no cambia de tipo.
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
- Las ofertas sólo se crean y editan con conexión. Sin conexión, el apartado
  Ofertas muestra la copia guardada en la PC (listado y detalles ya abiertos)
  con un aviso, y oculta crear, editar y las acciones de estado.
- Por medio de pago, por monto de compra, «Todos los productos», «No aplicar»
  en un producto (`skipOffers`) y las ofertas quitadas de la venta
  (`skippedOfferIds`) funcionan igual sin conexión: el motor es el mismo y la
  venta guardada los manda al sincronizar.

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
  búsqueda por nombre o producto); las archivadas se ven filtrando por
  «Archivada». Columnas de vigencia, sucursales, estado, ventas, unidades y
  descuento otorgado. Los íconos de acción muestran un aviso con el estilo del
  sistema (qué hace cada uno) y las acciones que cambian el estado se
  confirman en un diálogo propio, nunca el del navegador.
- Alta y edición en 5 pasos (tipo, productos, descuento, vigencia, resumen),
  con escáner y valores rápidos (10 %, 2x1, 2da al 50 %…). En Descuento y
  Resumen, «Cómo queda» muestra el precio de lista de cada producto y el
  precio con la oferta; en un combo, cada producto, el precio de lista del
  combo y el del combo. Detalle con historial y ventas.
- Ventas: etiqueta y ahorro por renglón, subtotal tachado, «Ahorro por
  ofertas» en el pie y en el cobro (en el cobro, un ícono ⓘ explica al pasar
  el mouse o con Tab qué ofertas descuentan, a qué productos y cuánto; se
  quitan desde el carrito), «El cliente ahorró» en la venta
  confirmada. En el historial, la lista tiene la columna «Ahorro» (importe y si fue
  oferta, descuento o ambos) y el detalle tacha el precio de cada renglón y desglosa
  subtotal, ahorro por ofertas y descuento (SISTEMA-104; sale de
  `discountMinor` y `offerDiscountMinor` de cada renglón). Qué oferta se
  aplicó se ve al pasar el mouse: en cada renglón (lista, oferta, descuento y
  lo cobrado) y junto al ahorro (cada oferta con su etiqueta y ahorro). En el catálogo, la etiqueta de la oferta muestra al pasar el
  mouse sus productos. El bloque del producto elegido muestra primero la
  oferta (en un combo, hasta 5 productos con su precio, el precio del combo y
  «Agregar combo») y «Ver producto» vuelve a la cara con la foto. En el
  carrito, una línea por oferta a completar dice qué gana el cliente («Agregá
  Shampoo y ahorrás $10.075 (10%)», «Agregá 1 más y te llevás 1 gratis»), con
  el botón para completarla y la ✕ para descartarla en esa venta. Después de
  las sugerencias, el mismo pasador muestra las ofertas ya aplicadas (con ✓)
  con su ahorro; al cumplirse una sugerencia salta a su versión aplicada, así
  el pasador no desaparece (SISTEMA-104). Si el
  ahorro cambia sin que cambie el carrito (venció una oferta, se reanudó la
  venta), se avisa. Un precio manual sobre un producto en oferta avisa que la
  oferta no se aplica.
- Productos: etiqueta «En oferta»/programada en la fila, filtro «Con oferta
  vigente», ofertas del producto en el editor y «Crear oferta para este
  producto».
- El aviso de «por debajo del costo» se muestra en el alta (con permiso de
  costos), con el costo del lote más reciente de la sucursal; no bloquea.

## Reportes

`GET offers/reporte` (permiso `OFFER_READ` o `REPORT_READ`) y las columnas
del listado: por oferta, ventas, unidades, descuento otorgado y facturación
(importe de lista menos la oferta de las unidades en promoción, antes del
descuento general). Excluye ventas anuladas. Filtros de fecha y sucursal.
Queda listo para sumarlo a `REPORTS_PLAN.md`.

## Por medio de pago (12/11/2026)

Tipo `PAYMENT_METHOD`: un porcentaje (`percentBps`) y uno o más medios
(`Offer.paymentMethods`: efectivo, transferencia, tarjeta, cuenta corriente),
sobre los productos elegidos (o todos) y con la vigencia de siempre (ej.
«10% en efectivo los martes»). No lleva topes de unidades.

- **Proporcional**: el porcentaje se aplica sobre la parte del ticket que se
  paga con esos medios. Ticket $10.000 con 10% en efectivo: $4.000 con tarjeta
  y el resto en efectivo → el efectivo cubre $6.000, descuento $600, total
  $9.400. Se calcula con los importes que no tienen vuelto
  (`descuentoPorMedioDePago` en el motor): si el efectivo no da el descuento y
  hay efectivo, `d = p·E·Q / (T − p·E)` con Q lo pagado con los medios que
  califican; si no, `d = p·E·(T − K) / T` con K lo pagado con los otros. T es
  el total de la venta sin este descuento (incluye conceptos, precios
  especiales y descuento general) y E lo que vale lo que entra en la oferta.
- Se calcula **después** de las demás ofertas, sobre el precio ya ofertado, y
  respeta «combinable» como las demás. Varias ofertas por medio de pago no se
  suman: va la de mayor ahorro (lo habitual es una sola; que cada farmacia
  elija sumarlas queda pendiente).
- Venta: la API recibe los pagos y recalcula; el descuento se reparte entre los
  renglones elegibles y queda como cualquier oferta (`offerDiscountMinor`,
  `SaleOffer`), así que fiscal, tickets, devoluciones y reportes no cambian.
- Web: el carrito sólo la sugiere («Pagando con efectivo… ahorrás $X (se
  aplica al cobrar)»). En la ventana de cobro el total se recalcula con los
  pagos cargados y el que se está cargando; el importe precargado se actualiza
  solo si la cajera no lo tocó (`lib/ofertas-cobro.ts`). Al cambiar de medio,
  un importe que cubría todo (exacto o con vuelto) pasa a ser lo que falta con
  el nuevo medio; solo uno menor se conserva como pago mixto (SISTEMA-104). Al confirmar se
  recalcula con los pagos finales y eso es lo que se manda.

## No combinables: gana la mejor (12/11/2026)

Las ofertas de toda la venta (por monto de compra y por medio de pago) se
calculan después de las de producto. Si una quedó bloqueada en algún producto
por otra oferta no combinable, el motor prueba también sin la oferta que la
bloquea y se queda con el resultado de mayor ahorro total para el cliente. Ej.:
10% superando $100.000 (no combinable) y 15% en efectivo → pagando en efectivo
gana el 15%. Con 20% por cantidad en un solo producto, ese producto conserva el
20% y el 15% en efectivo va al resto, porque así se ahorra más.

## Por monto de compra (12/11/2026)

Tipo `SPEND_THRESHOLD`: un monto mínimo (`Offer.minPurchaseMinor`) y un
porcentaje (`percentBps`) o pesos (`amountMinor`), sobre los productos elegidos
o «Todos los productos». Ej.: «comprando $100.000 o más, 10% menos».

- El mínimo se mide con lo que entra en la oferta **ya con las demás ofertas**
  (precio ofertado). Si llega, el descuento es una vez por venta: el % sobre
  ese importe o los pesos (nunca más que el importe), repartido entre los
  renglones proporcional a su neto.
- Se calcula después de las ofertas por producto y antes de las por medio de
  pago (que miden el total ya con este descuento). Respeta «combinable»; varias
  ofertas por monto no se suman: va la de mayor ahorro. No lleva topes de
  unidades.
- Carrito: si falta hasta un 30% del mínimo, sugiere «Sumá $X más y tenés …
  menos».
- Por medio de pago y por monto con «Todos los productos» no marcan cada
  producto como «En oferta» (no cambian su precio).

## Fuera de esta versión

- Condición por cliente puntual (sólo listas de precios).
- Sumar varias ofertas por medio de pago en una misma venta.
- Crear o editar ofertas sin conexión.
- Reporte interactivo de ofertas en Reportes.
