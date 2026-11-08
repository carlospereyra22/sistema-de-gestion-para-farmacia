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
  compras, recepciones, transferencias y catálogo necesitan conexión.
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
| SISTEMA-64 Vender sin conexión y sincronizar solo (web)       | Esta etapa |
| Sesiones: cerrar sesión y entrar sin conexión                 | Pendiente  |
| Caja (abrir, movimientos, cerrar) y cuenta corriente          | Pendiente  |
| Compras y recepciones sin conexión                            | Pendiente  |
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
