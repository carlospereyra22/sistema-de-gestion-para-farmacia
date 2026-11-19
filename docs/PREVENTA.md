# Preventa (SISTEMA-108)

Pedidos que toma el **preventista** en la calle desde el celular, que entrega el
**repartidor** y que la farmacia sigue desde la gestión: reparto con mapa, cobros,
comisiones y cartera de clientes. Inspirado en la app de preventistas anterior
(React + Firebase), rehecho sobre la gestión: mismos productos, precios, ofertas,
clientes, stock, caja y cuentas corrientes.

Estado: primera versión, en la rama `feature/SISTEMA-108`. Ver "Pendiente" al final.

## Módulo aparte (lo habilita la plataforma)

Como el catálogo online: el superadmin lo prende por farmacia en el panel de
plataforma (detalle de la farmacia → **Módulos → Preventa**;
`PATCH platform/organizations/:id/modules` con `preventaEnabled`, auditado como
`PLATFORM_PREVENTA_ENABLED`/`DISABLED`). Se guarda en `Organization.preventaEnabled`
(falso por defecto). Al prenderlo se crean los roles **Preventista** y **Repartidor**
si la farmacia no los tenía (no se tocan si ya existen).

Apagado: la gestión no muestra **Preventa**, la versión celular no se abre y la API
responde 403. No se borra nada.

## Roles y permisos

| Permiso            | Para qué                                                               | Lo trae                                     |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------- |
| `PREVENTA_SELL`    | Tomar pedidos, ver y editar los suyos, cartera, sus comisiones         | Rol Preventista                             |
| `PREVENTA_DELIVER` | Ver lo que reparte (y los pendientes sin repartidor), entregar, cobrar | Rol Repartidor                              |
| `PREVENTA_MANAGE`  | Ver todo, configurar, asignar reparto, comisiones y pagarlas           | Roles con `ORGANIZATION_MANAGE` (migración) |

El rol Preventista suma `CATALOG_READ`, `OFFER_READ`, `PARTY_READ` y `ACCOUNT_READ`
(ver saldos); el Repartidor, `PARTY_READ`. Se cambian desde Administración → Roles
(grupo **Preventa**).

## Dónde trabaja cada uno

- **Versión celular** (`preventa-app.tsx`): pantalla completa con la estructura de
  la app de preventistas anterior: encabezado con ☰ y título; menú lateral
  (`preventa-menu-lateral.tsx`) con la farmacia, el usuario y su rol, secciones
  agrupadas (Entregas, Gestión), modo oscuro, "Ir a la gestión" y "Cerrar sesión";
  detalle del pedido como página completa con flecha para volver, menú ⋮ (editar,
  compartir imagen, WhatsApp, reparto, cancelar), tarjeta "CLIENTE" y barra de total;
  pedidos con buscador, botón de filtros (hoja por secciones: Fecha, Estado,
  Preventista, con Restablecer/Aplicar) y barra verde de total. Colores de la
  gestión. Se abre sola al entrar para quien vende o reparte y **no** atiende el
  mostrador (`SALE_MANAGE`) ni administra (`PREVENTA_MANAGE`, `ORGANIZATION_MANAGE`).
- **Gestión** (menú **Preventa**): pestañas arriba y "Versión celular". Para volver a
  la preventa desde la gestión: menú de la cuenta → "Preventa (versión celular)" o,
  en pantallas chicas, el botón flotante "Volver a Preventa". La elección vale para
  esa pestaña del navegador (`sessionStorage`, `lib/preventa-modo.ts`).

Secciones según permisos (`seccionesVisibles`): Nuevo pedido, Pedidos, Reparto,
Clientes, Ofertas, Comisiones, Resumen y Configuración.

## Configuración (`PreventaSettings`)

| Opción                    | Qué hace                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------ |
| **Al entregar un pedido** | `NONE` sólo registra la entrega · `STOCK` descuenta stock · `SALE` registra la venta |
| Sucursal                  | De ella sale el stock y en ella se registran las ventas                              |
| Puede bajar precios       | Precio especial por producto, nunca más caro que la lista                            |
| Ve todos los clientes     | Apagado, el preventista ve sólo su cartera                                           |
| Ve el stock               | Muestra las unidades de la sucursal                                                  |
| Puede pedir sin stock     | Apagado, no se toma un pedido con más de lo que hay                                  |
| Aplicar ofertas           | Las ofertas de mostrador valen también en preventa                                   |
| Pie del comprobante       | Texto al final de la imagen que se comparte                                          |

Sin configurar, vale lo de la tabla por defecto: `NONE`, primera sucursal activa,
ve todos los clientes y el stock, puede pedir sin stock, aplica ofertas.

### Qué hace la entrega

- **NONE**: el pedido queda entregado con lo que pagó el cliente
  (`PreventaPayment`). Lo que falta se cobra después desde el pedido ("Registrar
  cobro"). No toca stock, ventas, caja ni cuentas corrientes.
- **STOCK**: además descuenta el stock de la sucursal en la misma transacción:
  lotes por vencimiento, sin vencidos ni stock negativo, `InventoryMovement`
  `ADJUSTMENT_OUT` con `referenceType = PREVENTA_ORDER`. Si falta algo no se entrega.
- **SALE**: registra la **venta** con las reglas de Ventas
  (`SalesService.completeFromModule`): stock por lote, precios, lista y crédito.
  - Clave de reintento = id del pedido: entregar dos veces no registra dos ventas.
  - Lo cobrado (efectivo, transferencia o tarjeta) queda en **Cobros pendientes** de
    Caja aunque la sucursal exija caja abierta: es la rendición del repartidor; la
    cajera lo incorpora a su caja.
  - Lo que no pagó va a la **cuenta corriente** del cliente (medio `ACCOUNT`). Si el
    cliente no tiene cuenta corriente, tiene que pagar el total (400). El saldo se
    cobra después en Cuentas corrientes.
  - Precio: el del pedido, salvo que la lista haya bajado (se cobra la lista). La
    oferta ya está en el descuento del pedido (`skipOffers`): no se aplica dos veces.
    Si la venta cobró menos que el pedido, el pedido queda igual a la venta.
  - Primero se registra la venta y después se marca el pedido. Si entre los dos pasos
    alguien cambió el pedido, la venta queda registrada y se avisa (revisar Ventas).

## Pedido

- Estados: `PENDING` (pendiente) → `IN_DELIVERY` (en reparto, con repartidor) →
  `DELIVERED`. Pendiente o en reparto → `CANCELLED` (con motivo). En reparto →
  pendiente: "No se pudo entregar" (con nota, queda en `deliveryNote`) o "Quitar del
  reparto". Pendiente → entregado directo también vale.
- Sólo se edita mientras está pendiente (productos, cantidades, precios, nota), con
  `expectedUpdatedAt`. Sus renglones y la foto de ofertas se reemplazan; el antes
  queda en la auditoría.
- Cobro: `paidMinor` = suma de `PreventaPayment`. Estado del cobro: pagado, pago
  parcial o sin pagar. Nunca se registra más que el total (el vuelto no se anota).
- Número correlativo por organización (`PreventaSettings.lastOrderNumber`, fila
  bloqueada).
- `requestId` + huella (cliente, renglones, precios pedidos, nota): reenviar el mismo
  pedido devuelve el original; mismo id con otro contenido es 409.
- Cambios de estado con fila bloqueada y estado esperado (`expectedStatus`): si otro
  lo cambió antes, 409.
- Todo queda en `AuditLog` (`PREVENTA_ORDER_*`).

### Quién ve y hace qué

- Preventista: ve sus pedidos; edita y cancela los suyos mientras están pendientes.
- Repartidor: ve los que tiene asignados y los pendientes sin repartidor ("Llevarlo
  yo"); entrega, marca "no se pudo entregar" y cobra. Sólo se asigna a sí mismo.
- Administrar: todo, incluido pasar varios pedidos juntos a reparto con un repartidor.

### Armado del pedido (como la app anterior)

- **Un pedido sin enviar por cliente**, guardado en el teléfono (`lib/preventa-borrador.ts`,
  `localStorage` por usuario y farmacia): cambiar de cliente no arrastra productos (los
  precios dependen de la lista de cada uno). Al volver a un cliente con un pedido a
  medio armar aparece **"Retomar pedido"** (Continuar / Empezar de nuevo). Sobrevive a
  recargar o cerrar la app; al recargar se vuelve al mismo cliente. Al enviarlo se
  borra y se vuelve a elegir cliente con el aviso de enviado.
- Cantidad: mientras se escribe, vacío no quita el producto (al salir vuelve el valor
  anterior); sólo un 0 escrito o el tacho lo quitan. Al tocar el campo se selecciona.
- Buscar clientes: en el teléfono, sin tildes ni mayúsculas, por nombre, dirección,
  documento o teléfono. Buscar productos: en el servidor, por palabras, sin tildes
  (`translate` de PostgreSQL), en nombre, marca y laboratorio, o código de barras exacto.

### Precios y ofertas

El servidor arma el pedido (`preventa-carrito.ts`): lista del cliente (o Precio
general), su respaldo y Precio general; precio especial del preventista si la
configuración lo permite (nunca más que la lista); ofertas de **mostrador** con el
mismo motor que Ventas (un precio puesto a mano reemplaza la oferta de ese producto).
`POST preventa/cotizar` calcula sin guardar: precios, ahorro, avisos ("Agregá 1 más
y llevás 10%") y ofertas de toda la compra. Las unidades de los pedidos (no
cancelados) cuentan para el tope total de cada oferta, igual que las ventas y el
catálogo.

Como el catálogo, la preventa ofrece sólo productos activos, no archivados en la
sucursal y **sin receta**.

## Clientes y cartera (`PreventaCustomer`)

Por cliente: preventista de la cartera, dirección de entrega, referencia, teléfono,
ubicación en el mapa (latitud/longitud, las dos o ninguna) y días de visita (máscara
de bits, 0 = domingo). "Visitar hoy" usa el día de Argentina. El preventista da de
alta un cliente nuevo desde la calle (nombre, documento, teléfono, dirección,
ubicación): se crea el `Customer` (decisión SISTEMA-108, ver DECISIONS) y queda en su
cartera; la cuenta corriente y la lista se habilitan desde Clientes. La cartera sólo
la cambia quien administra.

## Reparto

Lista de paradas, mapa (Leaflet + OpenStreetMap, carga diferida) y **recorrido
sugerido** desde la ubicación del teléfono: siempre al más cercano que falta (vecino
más cercano, en línea recta); los que no tienen ubicación van al final. "Google Maps"
abre la ruta con hasta 10 paradas. Cada parada: cómo llegar, llamar, entregar.

## Comprobante

Imagen PNG dibujada en el teléfono (`lib/preventa-comprobante.ts`, canvas, sin
dependencias): farmacia, número, cliente, renglones a precio de lista, ofertas,
total, pagado y saldo, pie configurable. Se comparte con el menú del teléfono
(WhatsApp, etc.) o se descarga. Dice "Comprobante interno de pedido · No válido
como factura". También: texto del pedido directo a WhatsApp.

## Comisiones

`PreventaSeller.commissionRateBps` (por preventista, en Configuración → Equipo).
Comisión = total del pedido entregado × porcentaje, redondeada al centavo. El
porcentaje del pedido es el puesto a mano (`commissionRateBps`, incluso 0) o, si no
tiene, el del preventista **hasta que se paga**: cambiar el del preventista llega a
todo lo pendiente. Al pagar (`PreventaCommissionPayment`) el porcentaje queda fijo en
cada pedido y ya no se cambia. Pagar comisiones no mueve la caja (si sale de la caja,
se registra el egreso en Caja). Cada preventista ve las suyas.

## Resumen

Por período (hoy, 7 o 30 días; sin cancelados): ventas, pedidos, ticket promedio,
clientes, entregado, cobrado y por cobrar, ventas por día, ranking de preventistas y
productos más pedidos. El preventista ve sólo lo suyo.

## Sin señal

Las consultas de la preventa están bajo `/organizations/...`: la copia local las
guarda y se ven sin conexión. Un pedido confirmado sin señal queda en la **bandeja
de salida** del teléfono (`lib/preventa-bandeja.ts`, `localStorage` por usuario y
farmacia) con su `requestId` y se manda solo al volver la conexión (cada minuto y al
reconectar). El servidor vuelve a calcular precios y ofertas: el total que se vio
sin señal es **estimado**. Si el servidor lo rechaza (por ejemplo, sin stock), queda
marcado en Pedidos para reintentar o descartar. Entregar y cobrar necesitan conexión.

## API

Bajo `organizations/:organizationId/preventa/` (`JwtAccessGuard`): `GET contexto`,
`GET|PUT configuracion`, `GET equipo`, `PUT equipo/:userId/comision`,
`GET|POST clientes`, `PUT clientes/:customerId`, `GET productos?q&cliente&pagina&ofertas&conStock`,
`GET ofertas`, `POST cotizar`, `GET|POST pedidos`, `POST pedidos/asignar`,
`GET|PUT pedidos/:id`, `POST pedidos/:id/(cancelar|quitar-del-reparto|no-entregado|entregar|cobros)`,
`PUT pedidos/:id/comision`, `GET comisiones`, `POST comisiones/pagar`,
`GET resumen?desde&hasta`.

Código: `apps/api/src/preventa/`; web en `apps/web/src/preventa-*.tsx` y
`apps/web/src/lib/preventa*.ts`.

## Pendiente

- Pedidos de entrega sin conexión (hoy entregar y cobrar necesitan señal).
- Pedido a droguería y gastos del preventista (estaban en la app anterior; en la
  gestión se usan Compras y los egresos de Caja).
- Confirmar con quien conozca la normativa si se pueden ofrecer medicamentos de
  venta libre a comercios no farmacéuticos (hoy: todo lo que no lleva receta).
- Recorrido por calles (hoy es en línea recta) y geocodificar direcciones.
- Imprimir el comprobante en la térmica desde el celular.
