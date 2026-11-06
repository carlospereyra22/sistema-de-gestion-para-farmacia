# Presentación de Caja

La pantalla se implementa en `apps/web/src/cash-workspace.tsx`. Tiene una barra de estado y tres pestañas: Sesión, Historial y Todas las cajas. En pantallas pequeñas todo se apila.

## Barra de estado

Con más de una caja en la sucursal muestra un selector con el estado de cada una; con una sola, su nombre. Cambiar de caja descarta lo escrito en los formularios de apertura y movimiento, para no registrarlo en otra caja. Cada caja abierta del selector indica quién la abrió. La barra también muestra desde cuándo está abierta y el responsable. Un usuario sin nombre cargado se identifica por su email.

Cobros pendientes está siempre a la vista, con cantidad y total. Abre el diálogo donde se asigna la caja y se incorpora el cobro a una sesión, con los cobros de la caja elegida primero.

Al abrir una caja con cobros asignados, ese diálogo se abre solo. No incorpora nada: cada cobro sigue necesitando su confirmación.

Cada cobro muestra el usuario que estaba logueado al hacerlo.

Cada acción abre un popup que pregunta si se quiere hacer y dice qué pasa con el dinero:

- **Asignar caja:** elegirla en la lista del cobro. No ingresa dinero.
- **Incorporar a {caja}:** botón directo, visible cuando la caja asignada está abierta. Ingresa el efectivo a su sesión y no se puede deshacer.
- **Quitar caja:** deja el cobro sin caja mientras no se incorporó. Después se puede asignar otra.

## Pestaña Sesión

La caja abierta y la cerrada usan la misma estructura: una fila de cuatro datos y debajo las tarjetas de trabajo. Abierta muestra Últimos movimientos, Movimiento manual y Cerrar caja. Cerrada no tiene Movimiento manual: Últimos movimientos ocupa su lugar, junto a Abrir caja.

Con la caja cerrada, los cuatro datos muestran el último cierre y Últimos movimientos muestra los últimos 7 días de la caja elegida, sin cierres eliminados del listado y con hasta 100 movimientos y 100 ventas. Si el último cierre tiene efectivo contado, debajo del fondo inicial aparece una fila con ese importe y el botón Usar; nunca se completa solo.

Si el usuario ya tiene otra caja abierta en la sucursal, Abrir caja queda deshabilitado con un aviso que la nombra. Una caja abierta en otra sucursal no figura en esta pantalla: la rechaza la API y el mensaje indica cuál es.

Con la caja abierta, los cuatro datos son los totales de la sesión:

- **Efectivo esperado:** `expectedAmountMinor`, calculado por la API. El detalle desglosa fondo, ingresos manuales y salidas.
- **Efectivo cobrado:** ventas netas de vuelto más cobros de cuenta corriente y cobros incorporados.
- **Tarjeta y Transferencia:** informativos, no entran al efectivo.
- **Últimos movimientos:** ventas en efectivo, vueltos, cobros y movimientos manuales, del más reciente al más antiguo, con conceptos legibles. Con el fondo inicial explican el esperado.

El resumen corresponde a la sesión abierta, no al día civil. No se inventan cantidades de cobros ni usuarios ausentes en la respuesta: la venta no guarda quién cobró, así que esas filas no muestran usuario.

Antes de cerrar, la confirmación avisa si la caja tiene cobros asignados sin incorporar. No impide el cierre.

## Pestaña Historial

Muestra las fechas que se aplican (por defecto, los últimos 30 días) y filtra por caja y, para administradores, por Estado. Todos los filtros se aplican al cambiarlos. Faltante, Sobrante y Sin diferencia se distinguen con texto y color. Conserva Ver cierre y Eliminar/Restaurar.

## Pestaña Todas las cajas

Lista las cajas de las sucursales asignadas al usuario, sin cambiar de sucursal: caja, sucursal, estado, quién la abrió, desde cuándo y responsable. Filtra por sucursal y por estado, e incluye las cajas deshabilitadas. Sólo informa: para operar una caja hay que entrar a su sucursal.

## Tamaños

La caja abierta y la cerrada ocupan lo mismo, para que la pantalla no salte al cambiar de estado: las variables `--cash-metrics-height` y `--cash-row-height` de `index.css` las definen. La lista de movimientos se desplaza por dentro de su tarjeta.

## Configurar cajas

Abre un popup con las pestañas Cajas, Reglas operativas y Cierres y arqueos. Crear una caja usa la sucursal activa, no abre una sesión y bloquea envíos simultáneos. Los errores se muestran dentro del popup.

Ventas muestra la caja donde se cobra y, con varias abiertas, permite cambiarla. Cuenta corriente y notas de crédito identifican las sesiones por el nombre de la caja y sugieren la elegida en el equipo o, si no hay, la que abrió el usuario.

## Actualización de datos

Al volver a la ventana, o cada 12 minutos, se renueva el token y la pantalla vuelve a consultar. Los datos anteriores quedan a la vista hasta que llega la respuesta: vaciarlos antes hacía parpadear los importes.
