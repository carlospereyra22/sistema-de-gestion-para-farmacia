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
  también se podrán usar sin conexión, cada uno en su etapa.
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
| Cuenta corriente sin conexión                                 | Pendiente  |
| SISTEMA-69 Compras y recepciones sin conexión                 | Esta etapa |
| Transferencias sin conexión                                   | Pendiente  |
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
  más de 24 horas desde la última sincronización, si la farmacia está en solo
  lectura o bloqueada, o si un pago es a cuenta corriente (llega en la etapa
  siguiente).
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

## Base de medicamentos en la PC (SISTEMA-69)

- La PC guarda la base de medicamentos completa (~18.000 productos, 4,3 MB) y los exhibidores (`lib/base-medicamentos-local.ts`). La baja con conexión al entrar, al volver internet y cada 10 minutos, pero sólo si cambió: `GET catalog/medicine-references/base-local?version=` responde `items: null` si la PC ya tiene esa versión. Así entra la actualización de precios de las 9 y las 17.
- Sin conexión, buscar medicamentos (por nombre, droga, laboratorio o código), buscar por código y leer exhibidores usan esa copia, en todas las pantallas. La búsqueda es la misma que la del servidor.
- Un exhibidor armado sin conexión se usa enseguida y se manda solo al volver. Si el servidor lo rechaza, se descarta, porque la compra ya llevó sus unidades.
- Crear productos del catálogo sin conexión queda para la etapa "Catálogo y precios sin conexión".
- El nginx de producción no comprime JSON. Con `gzip_types application/json` la descarga bajaría a ~0,7 MB.

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
