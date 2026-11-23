# Catálogo online (SISTEMA-107)

Página pública de la farmacia con sus productos. Un cliente con usuario del portal
arma un carrito y envía un pedido; a la farmacia le llega en **Catálogo online →
Pedidos** para confirmarlo, rechazarlo o marcarlo entregado.

Estado: primera versión, en la rama `feature/SISTEMA-107`. Ver "Pendiente" al final.

## Módulo aparte (lo habilita la plataforma)

El catálogo online **no viene incluido**: el superadmin lo prende por farmacia en el
panel de plataforma (detalle de la farmacia → **Módulos → Catálogo online**;
`PATCH platform/organizations/:id/modules`, auditado como
`PLATFORM_CATALOG_ENABLED`/`DISABLED`). Se guarda en `Organization.catalogEnabled`
(falso por defecto). Apagado:

- la gestión no muestra **Catálogo online** y su API responde 403;
- la página pública dice que el catálogo no está disponible;
- Ofertas no nombra al catálogo: no ofrece elegir canal, no lista las ofertas que
  son sólo del catálogo y muestra las de "ambos" como de mostrador (siguen
  aplicándose en Ventas). La API rechaza crear ofertas de catálogo o ambos; al
  editar, una oferta conserva el canal que ya tenía.

No se borra nada: al prenderlo de nuevo vuelve como estaba.

Con Preventa también habilitada, la farmacia puede elegir ver los pedidos de los
dos módulos juntos (SISTEMA-119): la pestaña Pedidos sale de acá y pasa a la
pantalla **Pedidos**. Ver `PEDIDOS.md`.

## Para la farmacia

Menú **Catálogo online**, con tres pestañas:

| Pestaña             | Permiso                               | Para qué                                                |
| ------------------- | ------------------------------------- | ------------------------------------------------------- |
| Pedidos             | `SALE_READ` (resolver: `SALE_MANAGE`) | Ver los pedidos, confirmarlos, rechazarlos, entregarlos |
| Usuarios del portal | `ORGANIZATION_MANAGE`                 | Dar acceso a un cliente: correo y contraseña inicial    |
| Configuración       | `ORGANIZATION_MANAGE`                 | Publicar, dirección, sucursal, lista, switches          |

Configuración:

- **Link para tus clientes**: `<sitio del catálogo>/<slug>`. El final del link lleva
  minúsculas, números y guiones y es único entre todas las farmacias.
- **Sucursal**: de ella sale el stock que se muestra y a ella llegan los pedidos.
- **Catálogo publicado**: apagado, la dirección dice que no está disponible.
  También deja de estar disponible si la farmacia no tiene la suscripción al día
  (solo lectura o bloqueada).
- **Mostrar productos sin stock**: apagado, sólo se ven los que tienen stock en la
  sucursal. Encendido, los demás aparecen con la etiqueta "Sin stock" y se pueden pedir
  igual (la farmacia confirma si lo consigue).
- **Mostrar precios sin iniciar sesión** e **Ingreso sólo con usuario y contraseña**.
- **Retiro** y **Envío a domicilio**: al menos uno. Con envío, el cliente escribe la
  dirección.
- **Lista de precios**: la de quien no ingresó o cuyo cliente no tiene lista propia.

## Qué productos se muestran

Los de **Productos** que estén activos, no archivados en la sucursal elegida, con
precio en alguna de las listas que corresponden y **sin receta**
(`prescriptionRequired = false`). Los medicamentos bajo receta no se publican nunca: la
normativa no permite publicitarlos ni venderlos a distancia sin receta. Falta
confirmarlo con alguien que conozca la normativa de cada provincia (venta libre
incluida).

El cliente nunca ve cantidades de stock, costos ni datos de la gestión: sólo
"hay / sin stock".

## Precio

El mismo orden que Ventas: la lista del cliente (o la del catálogo), después su lista de
respaldo y por último Precio general. La API calcula el precio y el total al recibir el
pedido; el carrito del navegador es sólo una vista. Si el cliente envía el total que vio
y no coincide, el pedido se rechaza con "Los precios cambiaron" para que lo revise.

## Pedido

- Estados: `RECEIVED` (por confirmar) → `CONFIRMED` → `DELIVERED`; `RECEIVED` o
  `CONFIRMED` → `REJECTED` (con motivo que ve el cliente); el cliente cancela sólo
  mientras está `RECEIVED` (`CANCELLED`). Un pedido cerrado no cambia más.
- Número correlativo por organización (`CatalogSettings.lastOrderNumber`, con la fila
  bloqueada: dos pedidos a la vez no repiten número).
- `requestId` + huella del contenido: reenviar el mismo pedido devuelve el original; el
  mismo id con otro contenido es 409.
- La farmacia decide con el estado que vio (`expectedStatus`): si otro empleado lo
  cambió antes, 409.
- **No pasa por caja ni por cuenta corriente.** Por defecto tampoco mueve stock: al
  entregarlo se registra la venta en Ventas. Con el switch **Descontar stock al
  entregar** (Configuración), al marcarlo entregado se descuenta el stock de la
  sucursal en la misma transacción: lotes por vencimiento, sin vencidos, con
  `InventoryMovement` `ADJUSTMENT_OUT` y `referenceType = CATALOG_ORDER`. Si falta
  stock de algún producto no se entrega nada (409). El pedido guarda
  `stockDeductedAt`; en ese caso no se carga en Ventas (se descontaría dos veces).
- La lista de la farmacia se actualiza cada 20 s y "Mis pedidos" del cliente cada
  15 s y al volver a la pestaña o a la app.
- Todo cambio queda en `AuditLog` (`CATALOG_ORDER_*`; los del cliente con `actorId`
  nulo y el `portalUserId` en `after`).

## Usuarios y sesión del portal

- `CatalogPortalUser`: atado a un `Customer` de la misma organización; correo único por
  organización (se guarda en minúsculas); contraseña con argon2. No es un `User` y no
  entra a la gestión.
- Sesión en `CatalogPortalSession` (la base, no la memoria: vale en las dos copias de la
  API). Cookie `gestion_catalogo`, `httpOnly`, `SameSite=Strict`, ruta
  `/api/v1/catalogo`, 30 días deslizantes. Guarda sha256 del secreto.
- Desactivar al usuario o cambiarle la contraseña cierra sus sesiones.
- Límite de intentos de ingreso: el mismo `LimiteDeLogin` de la gestión, con clave
  `catalogo:<slug>:<correo>`.

## API

Gestión (`JwtAccessGuard`), bajo `organizations/:organizationId/catalogo-online/`:
`GET|PUT configuracion`, `GET|POST usuarios`, `PATCH usuarios/:id`, `GET pedidos?estado=`,
`POST pedidos/:id/(confirmar|rechazar|entregar)`.

Público, bajo `catalogo/:slug/`: `GET` (portada), `GET productos?q&categoria&pagina&ids`,
`GET categorias`, `GET productos/:id/imagen`, `GET logo`, `POST ingresar`,
`POST salir`, `GET|POST pedidos`, `GET pedidos/:id`, `POST pedidos/:id/cancelar`.

Código: `apps/api/src/catalogo-online/`; gestión en `apps/web/src/catalogo-*.tsx`.

## Sitio del catálogo (`apps/catalogo`)

El cliente nunca entra a la web de la gestión: el catálogo es **otro sitio**, con su
propio código (React + Vite + Tailwind, como la landing) y sin nada de la gestión.
Si borra el final del link llega a la portada del catálogo ("Abrí el catálogo con el
link que te pasó la farmacia"), no a la pantalla de ingreso de la gestión.

Tres capas lo aíslan:

1. **Otro sitio**: no carga el código de la gestión ni su sesión.
2. **Proxy**: `apps/catalogo/public/_redirects` sólo reenvía `/api/v1/catalogo/*` a la
   API; cualquier otra ruta de la API no existe para ese sitio.
3. **CORS por ruta** (`apps/api/src/config/cors.ts`): el origen `CATALOGO_ORIGIN` sólo
   puede llamar a `/api/v1/catalogo/...`; la gestión sigue sólo con `CORS_ORIGIN`.

Y aunque llegara a la API, el usuario del portal no es un `User`: su correo y
contraseña no sirven para la gestión.

En la PC: `pnpm dev:catalogo` (puerto 5175); el lanzador de pruebas lo levanta solo.

**Dirección del sitio por ambiente (SISTEMA-120).** Test reusa la compilación de
la gestión de producción, así que la dirección no se fija al compilar: la web la
toma de `SITIOS_DEL_CATALOGO` (`apps/web/src/lib/catalogo-online.ts`) según el
sitio donde está abierta la gestión. Si se compiló con `VITE_CATALOGO_URL`, manda
esa. En la PC, `http://localhost:5175`. Un ambiente sin sitio publicado no muestra
un link roto: Configuración dice que todavía no está publicado. La farmacia elige
el final del link ("Final del link", único entre todas las farmacias).

**Test:** gestión `preprod-sistema-de-gestion.netlify.app` → catálogo
`preprod-catalogo-sistema-de-gestion.netlify.app`. `Publicar Preproduccion`
compila `apps/catalogo` desde `main` y deja `SUBIR-A-NETLIFY-CATALOGO-PREPROD`,
con `_redirects` que sólo reenvía `/api/v1/catalogo/*` a la API de test. Se sube
a mano a ese sitio de Netlify (nunca al de la gestión). Con el proxy, las llamadas
son del mismo origen y no hace falta `CATALOGO_ORIGIN`.

Para publicar en producción (pendiente, requiere autorización):

- Crear un sitio de Netlify nuevo para `apps/catalogo/dist`, compilado con
  `VITE_API_URL=/api/v1`.
- Compilar la web de la gestión con `VITE_CATALOGO_URL=<dirección de ese sitio>`.
- Cargar `CATALOGO_ORIGIN=<dirección de ese sitio>` en `/etc/gestion-api/environment` y
  `/etc/gestion-preprod/environment` (con el proxy de Netlify las llamadas son del
  mismo origen, pero queda declarado).
- Aplicar la migración `20261115120000_catalogo_online`.

## Pendiente

- Convertir un pedido confirmado en venta del POS con un clic (hoy se carga a mano).
- Aviso al cliente (correo o WhatsApp) cuando cambia el estado, y aviso en la campana
  de la farmacia cuando llega un pedido.
- Vitrina: orden de marcas, categorías ocultas por tipo de cliente, banners, color.
- Registro del cliente desde el catálogo (hoy el usuario lo crea la farmacia).
- Dominio o subdominio propio por farmacia.
- Revisión legal de qué productos de venta libre se pueden ofrecer.

## Ofertas

El catálogo usa el mismo motor de Ofertas que Ventas, con las ofertas de canal
"Catálogo online" o "Ambos" (`docs/OFFERS.md`). Todos los tipos sirven salvo la de
medio de pago.

- **Tarjeta:** la etiqueta de la oferta sobre la foto; los escalones se muestran
  completos (`x2 → 5% | x4 → 10%`).
- **Foto ampliada:** qué dice cada oferta ("Llevando 2 o más: 5% de descuento"),
  cuánto falta para el escalón siguiente y el ahorro con lo que ya está en el carrito.
- **Carrito:** `POST catalogo/:slug/cotizar` calcula en el servidor precios, descuentos,
  avisos ("Agregá 1 más y llevás 10% de descuento") y las ofertas de toda la compra
  ("desde $X"). El cliente ve lista tachada, precio con oferta, ahorro y total.
- **Pedido:** al confirmarlo la API vuelve a calcular con las ofertas bloqueadas (el
  tope no se pasa con dos pedidos a la vez), guarda el descuento por renglón
  (`CatalogOrderItem.discountMinor`, total = precio × cantidad − descuento) y la foto
  de cada oferta aplicada (`CatalogOrderOffer` + `CatalogOrderOfferItem`, como
  `SaleOffer`). Un cambio posterior de la oferta no cambia el pedido.
- Las unidades de los pedidos cuentan para el tope total de la oferta.
- Ventas no aplica las ofertas que son sólo del catálogo: para que el precio del
  pedido valga al entregarlo, usar "Descontar stock al entregar".
