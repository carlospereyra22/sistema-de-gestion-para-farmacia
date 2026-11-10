# Modo sin internet

Epic "Modo sin internet" (Trello `fbGUWeIg`). Objetivo: que la farmacia siga
vendiendo sin conexión y que todo se sincronice solo al volver. Se construye
por etapas; este documento dice qué hay hoy y cómo funciona.

## Decisiones del usuario (07/11/2026)

- Ventas hechas sin conexión que choquen al sincronizar (precio cambiado, stock
  que no alcanza, límite de crédito): se registran con el precio cobrado y
  quedan "a revisar". Nunca stock negativo.
- Factura C pedida sin conexión: ticket provisorio y CAE automático al volver
  (cola fiscal, SISTEMA-61). El Ticket nunca va a ARCA.
- Funcionan sin conexión: ventas, ingresos y egresos de caja, ventas y cobros
  de cuenta corriente, consulta de stock y precios. Abrir y cerrar caja,
  compras, recepciones, transferencias y catálogo necesitan conexión (ver el cambio del 08/11 abajo).
- Cobro de cuenta corriente mayor a la deuda al sincronizar: saldo a favor y aviso.
- Una PC trabaja sin conexión hasta 24 horas desde la última sincronización.

Cambio del 08/11/2026: el sistema tiene que funcionar normalmente sin conexión.
Reemplaza la lista de "solo con conexión" de arriba:

- Caja: también abrir y cerrar. La sesión abierta sin conexión se manda al
  volver con su hora real. Si otra PC abrió esa misma caja mientras tanto, las
  ventas se suman a esa sesión y queda un aviso. El cierre sin conexión se
  confirma al llegar: el servidor recalcula el esperado y avisa si cambió.
- Compras y recepciones, transferencias entre sucursales, y catálogo y precios
  también se podrán usar sin conexión, cada uno en su etapa. Transferencias:
  enviar, y recibir sólo lo que ya estaba en tránsito (SISTEMA-71).
- Sesiones: cerrar sesión y entrar sin conexión (cambio de turno). Entrar sin
  conexión verifica la contraseña en la PC (huella PBKDF2 guardada al entrar
  con conexión, nunca la contraseña) y sólo vale para quien entró con conexión
  en esa PC en las últimas 24 horas. Al volver la conexión, la sesión abierta
  manda las ventas pendientes de todos los usuarios de la PC; cada venta va
  firmada con una clave del usuario en esa PC (no exportable) para que el
  servidor la registre a nombre de quien la hizo.

Mientras esas etapas no estén hechas, las pantallas avisan que la operación
necesita conexión.

## Etapas

| Etapa                                                         | Estado     |
| ------------------------------------------------------------- | ---------- |
| SISTEMA-59 Facturas que no llegaron a ARCA no traban el punto | En main    |
| SISTEMA-61 Cola fiscal automática                             | En main    |
| SISTEMA-62 La app abre sin conexión (consulta)                | En main    |
| SISTEMA-63 Recibir ventas hechas sin conexión (API)           | En main    |
| SISTEMA-64 Vender sin conexión y sincronizar solo (web)       | En main    |
| SISTEMA-65 Comprobante interno a ARCA, factura en espera      | En main    |
| SISTEMA-66 Sesiones: cerrar sesión y entrar sin conexión      | En main    |
| SISTEMA-67 Caja sin conexión (abrir, movimientos, cerrar)     | En main    |
| SISTEMA-69 Compras y recepciones sin conexión                 | En main    |
| SISTEMA-70 Cuenta corriente sin conexión                      | En main    |
| SISTEMA-71 Transferencias sin conexión                        | En main    |
| SISTEMA-72 Todo listo sin conexión desde la primera visita    | En main    |
| SISTEMA-73 Proveedores y cuentas por pagar sin conexión       | Esta etapa |
| Catálogo y precios sin conexión                               | Pendiente  |
| Prueba completa con dos PCs                                   | Pendiente  |

## Cómo funciona (SISTEMA-62)

- **La app guardada en la PC**: un service worker (`vite-plugin-pwa`) guarda
  los archivos de la app para abrirla sin conexión. Nunca guarda respuestas de
  la API. Una versión nueva se ofrece con un aviso ("Actualizar") y nunca
  recarga sola.
- **Detectar sin conexión** (`lib/conectividad.ts`): error de red, tiempo
  agotado, 502/503/504 o una página de error HTML de un proxy. Un error propio
  de la API (400, 403, 409…) no es falta de conexión. Sin conexión se pregunta
  a `/health` cada 15 segundos.
- **Copia local** (`lib/cache-local.ts`, IndexedDB): `apiFetch` guarda las
  respuestas de sucursales, productos, listas y precios efectivos, packs,
  clientes, stock, caja, cuentas corrientes, opciones fiscales, estado de la
  suscripción y encabezado del ticket. Se separa por usuario (y los datos por
  organización y sucursal, que van en la dirección). Sin conexión devuelve lo
  guardado; las operaciones que escriben fallan con "Sin conexión: esta
  operación necesita internet".
- **Actualización**: cada consulta que sale bien reemplaza la copia. El shell
  además actualiza al volver la conexión y cada 10 minutos, así entran los
  precios de las 9 y las 17.
- **Abrir sin conexión**: si no se puede renovar la sesión por falta de
  conexión (no por sesión vencida) y el último usuario de la PC sincronizó hace
  menos de 24 horas, la app abre con su perfil guardado y un token local que
  nunca sale a la red. Apenas el servidor responde, se recupera la sesión real.
  Usuarios de la plataforma y con cambio de contraseña pendiente no abren sin
  conexión.
- **Cerrar sesión**: borra la copia en el momento. Si no hay conexión, el
  servidor se entera en el próximo arranque con conexión. Si entra otra
  persona en la PC, se borra la copia del usuario anterior.
- **Aviso**: "Sin conexión · datos de las HH:MM" en el encabezado; al tocarlo
  explica qué se puede hacer.

## Recibir ventas hechas sin conexión (SISTEMA-63)

`POST organizations/:org/branches/:branch/sales/offline` (SALE_MANAGE): el
mismo cuerpo de una venta, más `clientOperationId` (obligatorio), `occurredAt`
(ISO, cuándo se hizo) y `deviceId` (la PC). Cada renglón de producto lleva
`expectedUnitPriceMinor` (el precio cobrado) y puede llevar `productName`.
Responde la venta y `offlineIssues`. Reglas en `BUSINESS_RULES.md` (ventas sin
conexión). Puntos técnicos:

- Es `SalesService.complete()` con un contexto sin conexión: cada diferencia
  sólo se activa en ese modo; la venta con conexión no cambia.
- Idempotencia: `OfflineOperation` (id = `clientOperationId`) con
  `requestHash`. También devuelve la venta si el mismo id ya se registró con
  conexión (un envío que pareció fallar).
- Suscripción: la ruta lleva `@DecidedWhenOccurred()` (regla `OFFLINE_SYNC`); el
  servicio usa `subscriptionAccessAt` con la fecha de la venta.
- Factura: no se envía en el momento; la cola fiscal (SISTEMA-61) la emite.
- Avisos: `GET sales/offline-issues` (SALE_READ, `?todos=1` incluye revisados)
  y `POST sales/offline-issues/:id/resolve` (SALE_MANAGE, nota opcional).

## Vender sin conexión (SISTEMA-64)

- **Cuándo se cobra sin conexión**: al confirmar la venta, si la app ya está
  sin conexión o si el envío se corta en ese momento. No se puede si pasaron
  más de 24 horas desde la última sincronización o si la farmacia está en solo
  lectura o bloqueada. A cuenta corriente también se puede desde SISTEMA-70.
- **Bandeja** (`lib/bandeja-ventas.ts`, IndexedDB, claves `bandeja|usuario|id`):
  cada venta queda con el cuerpo listo para `POST sales/offline`, las unidades
  vendidas y el ticket impreso. El id es el `clientOperationId`, que también
  será el id de la venta: el número del ticket provisorio coincide con el del
  servidor. Cerrar sesión no la borra y se bloquea mientras haya pendientes.
  Las enviadas se guardan una semana para reimprimir.
- **Ticket provisorio** (`lib/venta-sin-conexion.ts`): mismo formato que el del
  servidor, con el encabezado del último ticket con conexión y la leyenda
  "COMPROBANTE PROVISORIO · SIN CONEXIÓN" (si pidió factura, avisa que se emite
  al volver internet). Se imprime por el agente local.
- **Hora**: `apiFetch` toma el encabezado `Date` de cada respuesta del servidor
  (la API lo expone por CORS) y la venta usa esa hora, no la del reloj de la PC.
- **Stock en pantalla**: el guardado menos lo vendido y todavía no enviado.
- **Envío** (`lib/sincronizacion-ventas.ts`, `use-sincronizar-ventas.ts`): con
  conexión y sesión real, de la más vieja a la más nueva, al cambiar la bandeja
  y cada 30 segundos. Una sola pestaña a la vez (Web Locks). Un corte o un
  error del servidor frena y reintenta después; un rechazo definitivo (datos,
  permiso, suscripción, conflicto) queda "Rechazada" para revisar y sigue con
  las demás. Al terminar se actualizan historial y stock.
- **Caja**: no se puede cerrar mientras la sucursal tenga ventas por enviar
  (sería un faltante falso: la plata está en el cajón pero no en el servidor).
  Sin conexión, la pantalla muestra lo último guardado (gestión, reglas,
  cierres, cobros pendientes y últimos movimientos). Abrir y cerrar avisan que
  necesitan conexión hasta la etapa de caja sin conexión.
- **Campanita**: suma las ventas sin enviar y los avisos "a revisar" del
  servidor. Abre el panel "Ventas sin conexión": reimprimir, reintentar una
  rechazada y marcar un aviso como revisado con una nota.
- **Historial**: el `#` muestra el número de ARCA (`Fact. C 00001-00000007`,
  "pendiente" o "rechazada") y abajo el código interno; el CSV lleva las dos
  columnas. Mientras alguna factura espera a ARCA, el historial (y el detalle
  abierto) se vuelve a consultar cada 15 segundos: el número aparece solo,
  sin recargar la página. El detalle marca "Sin stock al sincronizar" en el renglón que no
  tenía lote y muestra el código de barras de cada producto.
- **Anular** una venta cierra sus avisos abiertos ("Venta anulada").

## Sesiones sin conexión (SISTEMA-66)

- **Entrar sin conexión** (`lib/acceso-sin-conexion.ts`): al entrar con conexión escribiendo la contraseña, la PC guarda en `acceso|usuario` el perfil y una huella PBKDF2-SHA256 (150.000 iteraciones, sal propia), nunca la contraseña. Sin internet, el ingreso verifica la contraseña contra esa huella. Sólo vale si ese usuario sincronizó en la PC hace menos de 24 horas. Después de 5 intentos fallidos hay que esperar 30 segundos. La contraseña queda en memoria sólo hasta que vuelve la conexión, para iniciar la sesión real sola.
- **Varias personas por PC**: cada una conserva su copia local mientras pueda volver a entrar (24 h); después se borran su copia y su acceso, nunca sus ventas sin enviar.
- **Cerrar sesión** deja la copia y el acceso. La app ya no se abre sola, y se puede cerrar sesión con ventas sin enviar. Si no hay conexión, el servidor se entera al volver.
- **Al volver la conexión**: quien entró con contraseña sin conexión inicia su sesión real. Si había una sesión guardada, se recupera sólo si es de la misma persona; nunca se cambia de usuario por la cookie de otro (vuelve al ingreso con un aviso).
- **Ventas de otros usuarios** (`lib/firma-ventas.ts`): cada usuario tiene en cada PC una clave ECDSA P-256 que el navegador no deja exportar. La pública se registra en `POST auth/offline-key` al entrar con conexión (tabla `OfflineDeviceKey`). Cada venta sin conexión guarda el texto exacto enviado (`payload`), quién la hizo y su firma.
  - La sesión conectada manda también las de otros por `POST sales/offline/firmada`.
  - El servidor verifica la firma, valida el texto como cualquier venta sin conexión y la registra a nombre de quien la hizo. Audita `SINCRONIZADA_POR_OTRO` con quién la envió.
  - Sin acceso a la sucursal (403/404) o sin clave registrada todavía (409), la venta queda para su dueño. Una firma inválida queda rechazada para revisar.
- El stock en pantalla y el bloqueo de cierre de caja cuentan las ventas pendientes de todos los usuarios de la PC.
- **Ventas igual que con internet**: cobrar sin conexión abre la misma confirmación de venta, con el comprobante provisorio para ver e imprimir. El historial muestra lo que había hasta el corte más lo vendido en la PC sin enviar ("Por enviar"), que se puede reimprimir. Las ventas con Factura se emiten solas en ARCA al volver la conexión (cola fiscal).
- **Copia local**: desde SISTEMA-66 se guardan todas las consultas de datos de la farmacia (`/organizations/...`), no una lista fija. Cualquier pantalla abierta alguna vez con conexión se puede consultar sin ella; las de sesión y plataforma nunca se guardan.

## Caja sin conexión (SISTEMA-67)

- **Abrir, mover y cerrar sin internet**: la operación queda en la bandeja de la PC (`operacion: "CAJA"`), firmada por quien la hizo, y se manda sola al volver, en orden con las ventas (`POST cash/offline`, o `cash/offline/firmada` si la hizo otro usuario de la PC). Si el envío se corta en el momento, también queda en la PC.
- **La pantalla**: Caja y Ventas parten de la última copia del servidor y le aplican lo pendiente (`lib/caja-sin-conexion.ts`): aperturas, ventas, movimientos y cierres. El esperado que se ve es el que tendría el servidor.
- **El servidor**:
  - registra cada operación una sola vez (`OfflineOperation` `CASH_OPEN`/`CASH_MOVEMENT`/`CASH_CLOSE`), con su hora real;
  - la apertura usa como id de la sesión el de la PC, así las ventas de esa caja la encuentran;
  - si la caja ya estaba abierta por otra PC, la apertura apunta a esa sesión y todo se suma ahí (aviso `CAJA_YA_ABIERTA`).
- **Avisos**:
  - un egreso mayor al efectivo se acepta y se marca (`EGRESO_SUPERA_EFECTIVO`);
  - un movimiento que llega con la caja ya cerrada no entra en ese cierre (`MOVIMIENTO_RETENIDO`);
  - un cierre cuyo esperado no es el que vio la PC, o de una caja ya cerrada, queda marcado (`CIERRE_DISTINTO`);
  - quien abre teniendo otra caja abierta: `OTRA_CAJA_ABIERTA`.
- **Cerrar caja sin conexión** no espera a que se envíen las ventas pendientes: el cierre va después de ellas. Con conexión sigue bloqueado mientras haya ventas por enviar.
- **Orden**: si la sesión conectada no puede mandar algo (de otro usuario sin firma, o sin permiso), lo que vino después en esa sucursal espera. Una venta nunca llega antes que la apertura de su caja.
- **Red de seguridad**: si igual una venta llegó antes que la apertura de su caja (quedó en cobros pendientes con aviso `CAJA_CERRADA`), al llegar la apertura pasa sola a esa caja, como venta y con su hora original, y el aviso se resuelve. Fuera de ese caso, los cobros pendientes se siguen asignando a mano (decisión del usuario del 08/11/2026, se mantiene la del 17/10).
- **Quien reenvía** operaciones firmadas de otro usuario sólo tiene que ser de la farmacia: se validan la firma y los permisos de quien las hizo.
- **Lista de la caja**: cada venta muestra quién la hizo, con conexión (de la auditoría de la venta) y sin ella.
- **Mensajes**: la validación de la API responde en castellano (`common/http/mensajes-validacion.ts`).
- Migración `20261108100000_offline_cash`: tipos de operación y de aviso.

## Compras sin conexión (SISTEMA-69)

Decisión del usuario (08/11/2026): sin internet se pueden crear pedidos, hacer compras directas y recibir pedidos (los que ya estaban y los creados sin conexión, varias veces y de a partes). Al volver, todo se manda solo y en orden. La deuda con el proveedor se registra al llegar la recepción.

- **Bandeja**: la misma solicitud que se mandaría con conexión queda en la PC (`operacion: "COMPRA"`, `lib/compras-sin-conexion.ts`), firmada por quien la hizo. Se manda en orden con las ventas y la caja (`POST purchases/offline`, o `purchases/offline/firmada` si la hizo otro usuario de la PC). El stock de la PC sube enseguida.
- **Pedidos guardados**: con conexión, cada 10 minutos, la PC guarda la lista de compras y el detalle de los pedidos abiertos (`lib/precarga-compras.ts`). Así se pueden recibir sin conexión aunque nadie haya entrado antes a Compras.
- **La pantalla**: la lista y el detalle parten de la copia del servidor y suman lo pendiente (`comprasConPendientes`, `detalleConPendientes`). Un pedido creado sin conexión aparece como fila "Por enviar". Su id es su clave de operación y cada renglón se conoce por su producto, porque en un pedido los productos no se repiten. Las recepciones pendientes suman lo recibido y cambian el estado. Mientras un pedido tiene algo por enviar, lo que se haga con él también queda en la PC, para que llegue en orden. Cancelar o cerrar el saldo necesita conexión.
- **El servidor**:
  - registra cada operación una sola vez: el pedido por su `clientOperationId` y la recepción por su `operationId`;
  - usa la hora real: `orderedAt`, la recepción, `receivedAt`, el movimiento de stock y la fecha de la deuda;
  - acepta una recepción que se refiere al pedido por su clave y a los renglones por producto.
- **Conflicto**: si otra PC ya recibió o canceló ese saldo, la recepción se rechaza ("saldo abierto") y queda como rechazada en el panel de sincronización y arriba de la lista de Compras.

- **Transacciones**: cada operación que llega es una sola transacción. Incluye el pedido, la recepción, los lotes, los movimientos de stock, la deuda y la auditoría, también la de "sincronizada por otro". Si algo falla, se deshace entera y la PC la reintenta igual, sin duplicar. Si el servidor la rechaza, la PC deja de contarla en el stock y en el estado del pedido.

## Cuenta corriente sin conexión (SISTEMA-70)

Decisión del usuario (09/11/2026): toda la cuenta corriente funciona sin conexión igual que con conexión. Reglas en `BUSINESS_RULES.md` (cuenta corriente sin conexión).

- **Bandeja**: cobros, asignaciones, aumentos de deuda (por artículo y total), actualización de precios y configuración de la cuenta quedan como `operacion: "CUENTA"`; el alta de cliente, como `operacion: "CLIENTE"` (`lib/cuenta-sin-conexion.ts`). Van firmadas por quien las hizo y se mandan en orden con las ventas, la caja y las compras: `POST customer-accounts/offline` (o `/offline/firmada`) y `POST customers/offline` (o `/offline/firmada`).
- **Dónde se decide**: en el cliente de la API (`lib/api.ts`). Cada escritura de cuenta corriente intenta con conexión y, si no hay, queda en la PC. Si el cliente ya tiene algo sin enviar, va directo a la PC para llegar en orden. Sin conexión no se opera pasadas 24 horas sin sincronizar o con la farmacia en solo lectura.
- **Lo que se ve**: las consultas de cuentas (`getCustomerAccounts`, `getAccountItems`, clientes, vencimientos y estado de cuenta) parten de la copia del servidor y le suman lo pendiente de la PC, con la etiqueta "Por enviar" en la fila. Lo usan la venta (crédito disponible), Cuentas corrientes y Clientes. El comprobante del cobro y el detalle de una venta a cuenta sin enviar se arman en la PC; el comprobante lleva la leyenda de provisorio. Caja suma el efectivo de los cobros al esperado.
- **Ventas sin enviar**: la PC no conoce los ids de sus renglones (el servidor los parte por lote), así que los nombra por venta y producto (`linea|venta|p:producto`). El servidor reparte el importe entre los renglones reales. Una venta mixta se asigna nombrándola por su id.
- **Precarga**: con conexión, cada 10 minutos, la PC guarda clientes, cuentas, vencimientos, estado de cuenta y los artículos de cada cliente con saldo (`lib/precarga-cuentas.ts`).
- **El servidor** (`accounts/cuenta-sin-conexion.ts`, `common/offline/registro-sin-conexion.ts`):
  - registra cada operación una sola vez (`OfflineOperation`, mismo id con otros datos es 409) y, si ya había llegado con conexión, devuelve la de entonces;
  - usa la hora real en el movimiento, el ajuste, el ingreso de caja y el cobro pendiente;
  - cada operación es una sola transacción, con su auditoría, sus avisos y la marca "sincronizada por otro": si algo falla se deshace entera;
  - avisos nuevos: `SALDO_DISTINTO`, `CONFIGURACION_PISADA` y `CLIENTE_DUPLICADO` (además de `SALDO_A_FAVOR` y `CAJA_CERRADA`).
- **Edición de clientes**: también queda en la PC (`operacion: "CLIENTE"` con `tipo: "EDICION"`, mismo `POST customers/offline`). La lista de precios nueva se usa enseguida en la venta.
- **Precios en la venta**: la venta pide los precios por cliente y lista. Sin conexión, si esa combinación nunca se consultó, usa la copia de la lista sin cliente (es la misma lista). La PC guarda los precios de todas las listas en la precarga.
- **Lector de PDF de compras**: el service worker también guarda los `.mjs` (pdf.worker). Un PDF escaneado necesita el OCR, que se baja de internet: sin conexión sólo se leen los PDF con texto.
- Un cobro mixto conserva su desglose de medios de pago cuando después se le asignan artículos (también con conexión).
- Migraciones `20261109120000_offline_accounts` y `20261109130000_offline_customer_update`: tipos de operación y de aviso.

## Transferencias sin conexión (SISTEMA-71)

Decisión del usuario (09/11/2026): sin conexión se puede enviar (preparar y despachar) y recibir sólo lo que ya estaba en tránsito cuando había internet. Reglas en `BUSINESS_RULES.md` (transferencias sin conexión).

- **Bandeja**: preparar, despachar y recibir quedan como `operacion: "TRANSFERENCIA"` (`lib/transferencias-sin-conexion.ts`), firmadas por quien las hizo, y se mandan en orden con lo demás: `POST transfers/offline` (o `/offline/firmada`).
- **Dónde se decide**: en el cliente de la API (`createTransfer`, `dispatchTransfer`, `receiveTransfer` de `lib/api.ts`). Intentan con conexión y, si no hay, quedan en la PC. Una transferencia con algo sin enviar, o armada con un lote recibido sin enviar, va directo a la PC para llegar en orden. Con conexión la PC también manda una clave (`clientOperationId`), así una respuesta perdida no la duplica.
- **Lo que se ve**: la lista parte de la copia del servidor y suma lo pendiente: las preparadas como filas nuevas y los despachos y recepciones como cambio de estado, con la etiqueta "Por enviar". Despachar resta del stock de la PC (también en Ventas) y recibir suma. El formulario ofrece cada lote con lo que queda descontando lo despachado y vendido sin enviar, y suma los lotes recibidos en compras sin enviar. Un aviso (StatusToast) dice que quedó en la PC.
- **Recibir sin conexión**: sólo si la copia del servidor guardada en la PC la tiene en tránsito hacia esta sucursal. Si el origen la despachó sin conexión, el destino la ve recién cuando el origen sincroniza.
- **Precarga**: con conexión, cada 10 minutos y al reconectar, el shell guarda las transferencias de la sucursal; los lotes y las sucursales ya se guardaban. La lista (`GET transfers`) trae todas las en curso y sólo las últimas 50 terminadas, para que no crezca para siempre.
- **El servidor** (`transfers/transferencia-sin-conexion.ts`, `common/offline/registro-sin-conexion.ts`):
  - registra cada operación una sola vez (`OfflineOperation`); la transferencia preparada sin conexión lleva la clave de la PC en `Transfer.clientOperationId` y el despacho la nombra por esa clave;
  - un renglón puede nombrar el lote por id o por producto y número (lote recibido sin conexión);
  - usa la hora real en la transferencia y en los movimientos de stock;
  - cada operación es una sola transacción, con auditoría (`origen: SIN_CONEXION`), avisos y la marca "sincronizada por otro": si algo falla se deshace entera;
  - avisos nuevos: `TRANSFERENCIA_YA_DESPACHADA` y `TRANSFERENCIA_YA_RECIBIDA` (además de `STOCK_FALTANTE`).
- Lo recibido sin conexión suma al stock del producto, pero no se puede volver a transferir hasta que llegue al servidor: la PC no conoce todavía su lote en destino.
- Migración `20261109160000_offline_transfers`: clave de la PC en `Transfer` y tipos de operación y de aviso.

## Todo listo sin conexión desde la primera visita (SISTEMA-72)

Problema encontrado en preprod (09/11/2026): sin conexión fallaban el lector de PDF de compras ("Failed to fetch dynamically imported module") y el cierre de caja, si en esa PC no se había entrado antes a esas pantallas con conexión o si la versión era nueva.

- **Service worker**: `clientsClaim` toma la pestaña apenas se instala, sin esperar una recarga (una versión nueva igual espera "Actualizar"). Además, todo archivo de `/assets/` que se baje queda guardado (`app-archivos`), como red de seguridad.
- **Partes que se bajan aparte** (`lib/precargar-modulos.ts`): con conexión, a los 3 segundos de entrar, se precargan el lector de PDF y su worker, el lector de Excel y Reportes. Quedan en la pestaña aunque el service worker todavía no la controle.
- **Caja** (`lib/precarga-caja.ts`): con conexión, al entrar y cada 10 minutos, se guardan permisos y reglas de la caja, cobros pendientes, el historial del período por defecto y los últimos movimientos de cada caja. Sin eso no se podía cerrar sin conexión.
- **Prueba en navegador real** (`scripts/probar-sin-conexion.mjs`, obligatoria antes de publicar en preprod un cambio del modo sin internet; ver skill `cerrar-tarea`): Edge con un perfil nuevo contra la versión compilada como preprod. Entra con conexión con un usuario de prueba que crea sólo en `gestion_dev`, apaga el servidor y recorre cada pantalla, carga cada parte que se baja aparte y cierra la caja; el cierre queda en la bandeja de la PC. Resultado y capturas en `.cache/prueba-sin-conexion/`.
- **Fuera de alcance** (decisión del usuario, 09/11/2026): Reportes sigue sólo con conexión, igual que las acciones que nunca tuvieron modo sin conexión (asignar cobros pendientes, anular o devolver ventas, cancelar pendientes de compras, inventario, catálogo y administración). Cuentas por pagar pasó a funcionar sin conexión en SISTEMA-73.

## Proveedores y cuentas por pagar sin conexión (SISTEMA-73)

Decisión del usuario (10/11/2026): que Proveedores y Cuentas por pagar funcionen sin internet de la misma manera que los otros módulos. Reglas en `BUSINESS_RULES.md` (proveedores y cuentas por pagar sin conexión).

- **Bandeja**: el alta, la edición y la baja o restauración de un proveedor quedan como `operacion: "PROVEEDOR"` (`lib/proveedores-sin-conexion.ts`); la deuda, el pago y la anulación, como `operacion: "PAGAR"` (`lib/pagar-sin-conexion.ts`). Se guardan con `lib/guardar-en-la-pc.ts`: firmadas por quien las hizo y con una hora siempre posterior a lo último de la PC, así un pago nunca llega antes que su deuda ni una deuda antes que su proveedor. Se mandan en orden con lo demás: `POST suppliers/offline` y `POST supplier-payables/offline` (o `/offline/firmada`).
- **Dónde se decide**: en el cliente de la API. Proveedores: `createParty`, `updateSupplierTerms` y `setSupplierActive` de `lib/api.ts`. Cuentas por pagar: `createPayable`, `paySupplier` y `voidSupplierPayment` de `supplier-payables/api.ts`. Intentan con conexión y, si no hay, quedan en la PC. Lo de un proveedor o una deuda que ya tiene algo sin enviar va directo a la PC. Una deuda (o una compra) de un proveedor dado de alta sin conexión también espera en la PC, detrás del alta.
- **Lo que se ve**: Proveedores parte de la lista del servidor y le suma lo pendiente (`proveedoresConPendientes`), con la etiqueta "Por enviar"; el proveedor nuevo aparece también en Compras y en Cuentas por pagar. Cuentas por pagar, sin conexión o con algo sin enviar, arma la página en la PC (`deudasConPendientes` y `paginaDeDeudas`) desde la copia `base-local`: suma las deudas nuevas, las de recepciones o compras directas sin enviar con "Dejar pendiente de pago", los pagos (repartidos del vencimiento más viejo al más nuevo) y las anulaciones. La fecha de hoy es la del servidor según la PC.
- **Precarga**: con conexión, al entrar y cada 10 minutos, el shell guarda la lista de proveedores y, si el rol ve Cuentas por pagar, la copia de deudas y las opciones.
- **El servidor** (`parties/proveedor-sin-conexion.ts`, `supplier-payables/pagar-sin-conexion.ts`, `common/offline/registro-sin-conexion.ts`):
  - registra cada operación una sola vez (`OfflineOperation`); proveedor, deuda y pago creados sin conexión llevan como id la clave de la PC;
  - usa la hora real en el alta, la deuda, el pago y la anulación, y la anota en la auditoría (`origen: SIN_CONEXION`);
  - acepta nombrar la deuda por su id o por su clave (la de una deuda cargada sin conexión o la de una recepción), el pago por su id o su clave, y la compra vinculada por su id o por la clave de un pedido hecho sin conexión;
  - cada operación es una sola transacción, con su auditoría, sus avisos y la marca "sincronizada por otro";
  - una edición sin conexión sólo aplica los campos que se cambiaron y no pisa los que otra PC cambió después (se comparan con la auditoría, por su hora real);
  - avisos nuevos: `PROVEEDOR_INACTIVO`, `COMPROBANTE_REPETIDO`, `PAGO_SUPERA_SALDO` y `PAGO_YA_ANULADO` (además de `CONFIGURACION_PISADA`).
- **Rechazos**: una deuda exactamente repetida, o un pago o anulación cuya deuda o pago no existe en el servidor, responden 422 y quedan "Rechazada" en el panel. No se usa 404/409, que en la bandeja significan "queda para su dueño" y frenarían el resto de la sucursal.
- **Caja**: proveedores y cuentas por pagar no mueven Caja, así que lo pendiente de ellos no bloquea el cierre.
- Migración `20261110100000_offline_payables`: tipos de operación y de aviso.

## Base de medicamentos en la PC (SISTEMA-69)

- La PC guarda la base de medicamentos completa (~18.000 productos, 4,3 MB) y los exhibidores (`lib/base-medicamentos-local.ts`). La baja con conexión al entrar, al volver internet y cada 10 minutos, pero sólo si cambió: `GET catalog/medicine-references/base-local?version=` responde `items: null` si la PC ya tiene esa versión. Así entra la actualización de precios de las 9 y las 17.
- Sin conexión, buscar medicamentos (por nombre, droga, laboratorio o código), buscar por código y leer exhibidores usan esa copia, en todas las pantallas. La búsqueda es la misma que la del servidor.
- Un exhibidor armado sin conexión se usa enseguida y se manda solo al volver. Si el servidor lo rechaza, se descarta, porque la compra ya llevó sus unidades.
- Crear productos del catálogo sin conexión queda para la etapa "Catálogo y precios sin conexión".
- El nginx de producción no comprime JSON. Con `gzip_types application/json` la descarga bajaría a ~0,7 MB.

## Rendimiento sin conexión (SISTEMA-74)

- **Sin conexión no se sale a la red**: con la falta de conexión ya detectada, `apiFetch` responde con la copia de la PC sin intentar la red (y las escrituras quedan en la bandeja enseguida). Antes cada pantalla intentaba primero la red; si la red colgaba los pedidos en vez de rechazarlos, se acumulaban y todo se volvía cada vez más lento. Volver a conectarse lo detecta el sondeo de `/health`. Con conexión, cada pedido tiene un tiempo máximo de 30 s.
- **Bandeja en memoria**: se lee de una vez (`valores` del almacén) y se reutiliza hasta que cambie, en esta pestaña o en otra.
- **Catálogo por partes**: la copia del catálogo sin conexión son las partes que guarda `lib/catalogo-local.ts` (antes, una respuesta de más de 8 MB no se guardaba y con catálogos grandes no había catálogo sin conexión). Ver `RENDIMIENTO.md`.

## Cómo probarlo

El service worker no corre con `pnpm dev`: se prueba con la versión compilada.

```powershell
# Con la API local corriendo (Iniciar Gestion - Pruebas.cmd)
$env:VITE_API_URL = "/api/v1"
pnpm --filter @gestion/web build
pnpm --filter @gestion/web exec vite preview --port 4173
```

Abrir http://localhost:4173, entrar y pasar por Ventas e Inventario. Para
cortar: cerrar la API, o DevTools → Network → Offline. Recargar: la app abre
con los datos guardados y el aviso. Volver a levantar la API: en hasta 15
segundos dice "Reconectando…" y vuelve a la normalidad. La copia y el service
worker se ven en DevTools → Application.
