# Pedidos: catálogo online y preventa juntos (SISTEMA-119)

Una farmacia con los dos módulos (Catálogo online y Preventa) puede elegir ver
todos sus pedidos en **una sola pantalla**, en vez de mirar en dos lugares. Es
opcional: apagado, cada módulo muestra sus pedidos como siempre.

## Dónde se elige

**Organización → Datos generales → Pedidos → "Ver los pedidos juntos"**.

- La tarjeta aparece sólo si la farmacia tiene **los dos** módulos habilitados.
- La cambia quien tiene `ORGANIZATION_MANAGE`; el resto la ve deshabilitada.
- Se guarda en `Organization.unifiedOrders` (falso por defecto) con
  `PUT organizations/:id/pedidos/vista` `{ unificados }`, auditado como
  `ORGANIZATION_UNIFIED_ORDERS_CHANGED` (antes y después).
- No se puede prender sin los dos módulos (400). Si la plataforma apaga uno de los
  dos, la pantalla deja de existir y cada módulo vuelve a lo suyo; el valor se
  conserva y vuelve al prenderlo.

## Qué cambia al prenderlo

- Aparece **Pedidos** en el menú (después de Ventas) y **Catálogo online** y
  **Preventa salen del menú**: todo se ve desde Pedidos, con tres pestañas arriba
  (cada una con su ícono propio):
  - **Pedidos**: los de los dos módulos juntos (abajo).
  - **Preventa**: el resto del módulo sin su pestaña Pedidos (Nuevo pedido,
    Reparto, Clientes, Ofertas, Comisiones, Resumen, Configuración y "Versión
    celular"). Quien administra arranca en Reparto. Si hay pedidos tomados sin
    señal, la bandeja se muestra arriba de cualquier sección.
  - **Catálogo online**: Usuarios del portal y Configuración, sólo para quien
    tiene `ORGANIZATION_MANAGE`.
- Cada uno ve sólo las pestañas que puede abrir; con una sola no hay barra.
- Una dirección vieja (`?pagina=preventa`, `?pagina=catalogo`) abre su pestaña
  dentro de Pedidos.
- La **versión celular** de preventa no cambia: el preventista y el repartidor
  siguen con su pestaña Pedidos.

## La pantalla Pedidos

Sólo lee y junta. Cada pedido se resuelve con **las acciones y la API de su
módulo**, que siguen siendo la autoridad (estados, permisos, stock, cobros).

- **Tarjetas de arriba**: por atender (los dos juntos, sin importar la fecha),
  catálogo por confirmar, preventa pendientes y el total de la lista. Tocar una
  filtra la lista.
- **Filtros**: búsqueda por cliente o número (sin importar tildes), origen,
  preventista (sólo quien administra preventa; deja afuera los del catálogo),
  desde y hasta (por defecto, los últimos 30 días).
- **Estado**, agrupado para leerlo igual:

  | Grupo       | Catálogo online      | Preventa   |
  | ----------- | -------------------- | ---------- |
  | Por atender | Por confirmar        | Pendiente  |
  | En curso    | Confirmado           | En reparto |
  | Entregados  | Entregado            | Entregado  |
  | Cancelados  | Rechazado, Cancelado | Cancelado  |

  Por atender y En curso **no usan las fechas**: lo abierto se ve siempre, para que
  un pedido viejo sin resolver no quede escondido.

- **Tabla**: número (`000128` catálogo, `P-00512` preventa), origen, cliente con
  cómo llega o quién lo tomó, estado (y el cobro que falta en preventa entregada),
  fecha y total. El pie suma sin cancelados ni rechazados.
- **Detalle**: el del catálogo (confirmar, rechazar con motivo, marcar entregado)
  o el de preventa (compartir, editar, pasar a reparto, entregar y cobrar,
  cancelar), en un diálogo. **Editar** un pedido de preventa abre Preventa → Nuevo
  pedido y, al terminar o cancelar, vuelve a Pedidos.
- **Pasar a reparto**: quien administra preventa elige pendientes de preventa con
  la casilla y los asigna juntos a un repartidor.
- Se actualiza sola cada 20 s. Sin conexión muestra lo último que se cargó.

## Quién ve qué

Abre la pantalla quien ve algún origen: `SALE_READ` (catálogo) o algún permiso de
preventa. Cada uno ve de cada origen lo que ya veía en su módulo: el mostrador,
sólo el catálogo; el preventista, sus pedidos; quien administra preventa, todos.

## API

`GET organizations/:id/pedidos?grupo=&origen=&desde=&hasta=&vendedor=` (módulo
`apps/api/src/pedidos`). Usa los servicios de cada módulo
(`CatalogoOnlineService.pedidos` y `PreventaPedidosService.listar`, que aceptan
varios estados y, el del catálogo, fechas) y une las listas del más nuevo al más
viejo, con tope de 300. Devuelve `origenes`, `porAtender` (sin filtros),
`descuentaStock` (catálogo), `resumen` (cantidad y total sin cancelados, en
centavos como texto) e `items` `{ origen, pedido }`. 403 si la farmacia no eligió
verlos juntos o le falta un módulo. Reglas puras en `pedidos-reglas.ts`.
