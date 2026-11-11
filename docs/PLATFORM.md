# Panel de plataforma y cobro de suscripciones

Plan aprobado el 06/11/2026. Epics en Trello: `Planes, suscripcion y cobro` y
`Alta de farmacias (onboarding multi-cliente)`. Los importes están en la epic y, cuando
exista, en la base: no se escriben en el código, en este documento ni en la landing.

## Objetivo

Una vista exclusiva para los dueños de la SaaS: crear farmacias y usuarios, ver quién pagó
y qué tiene cada una, y cortar a quien no paga, con posibilidad de postergar.

## Decisiones

- Se cobra por sucursal y por usuario activo (`DECISIONS.md`). Hoy no se cobra por módulo,
  pero el código queda preparado para activarlo sin desarrollo nuevo.
- El abono sale de una fórmula: base más usuario adicional más sucursal adicional. Cada
  farmacia puede tener un precio acordado que reemplaza a la fórmula.
- Pago adelantado: paga 10 meses y lleva 12. Los meses pagados y regalados se editan desde
  el panel. Ese precio queda fijo todo el período: los aumentos no lo alcanzan.
- Ampliar: una farmacia puede sumar usuarios o sucursales pagando más. Lo pide por el canal de
  contacto y el equipo lo aplica desde el panel. El cupo rige al instante, lo que resta del
  período se cobra proporcional con un cargo de ajuste y el abono nuevo rige desde el próximo.
- Aumentos sin calendario fijo: el equipo decide cuándo sube y desde qué fecha rige. El precio
  nuevo se aplica desde el próximo período, sin tocar lo ya pagado por adelantado.
- Cobro manual al arrancar: transferencia o link, registrado en el panel. Mercado Pago después.
- Farmacia Juncos es de los fundadores: exenta para siempre.
- Corte automático con avisos, siempre con prórroga manual.
- Demos gratis: para más adelante. Una demo será una farmacia en prueba con fecha de fin.
- El alta la hace solo el equipo desde el panel. No hay registro abierto.

## Cuentas de plataforma

- Pantalla aparte en `/plataforma`, dentro de `apps/web`, con menú propio y carga diferida.
- Cuentas dedicadas, sin membresía en ninguna farmacia. Solo ven el panel.
- El superusuario no es un `Permission`: `roles.service.ts` acepta cualquier código, así que
  una farmacia podría asignárselo. Es una tabla propia, `PlatformAdmin`, otorgable solo por
  comando en el servidor, sin endpoint.
- La API lee esa tabla en cada pedido y responde 404 a cualquier otro usuario.
- Código de un solo uso (TOTP) obligatorio. El bloqueo por intentos va en el paso del código,
  no en la clave: si no, cualquiera con el correo podría sacarnos del panel.
- Auditoría propia, porque `AuditLog.organizationId` es obligatorio.
- El panel muestra solo datos comerciales: sin ventas, clientes ni stock. Para ver lo de una
  farmacia hay que entrar como uno de sus usuarios (Soporte, abajo). La decisión del 06/11 de
  no entrar como una farmacia queda reemplazada (decisión del usuario, 11/11/2026).

### Soporte: entrar como un usuario (SISTEMA-89)

Decisión del usuario (11/11/2026): desde el panel se entra como cualquier usuario de una
farmacia, para reproducir y arreglar un problema; se puede hacer todo lo que hace ese usuario.
Sin motivo ni avisos: la farmacia no lo ve. La landing no cambia.

- Sección **Soporte** del panel: un buscador elige la farmacia y otro, opcional, la sucursal
  (muestra solo a quienes tienen acceso a ella); cada usuario activo tiene "Entrar como". También
  está en cada usuario del detalle de una farmacia. La app se ve exactamente como la ve ese
  usuario; un botón chico y oscuro abajo a la izquierda (que ve solo el superadmin) vuelve al
  panel, a la misma sección y con la misma farmacia elegida.
- `POST platform/organizations/:id/users/:userId/soporte` crea una sesión del usuario sin clave
  de renovación, que dura hasta volver al panel (tope técnico de 7 días; si se cierra la
  pestaña estando adentro, el panel la corta la próxima vez que se abre), y entrega un token con
  la marca `soporte` (firmada por el servidor). `POST platform/soporte/:sessionId/salir` la corta. Usuarios inactivos y otras
  cuentas de plataforma no se pueden usar.
- La sesión del superadmin sigue viva y se renueva aparte. En la PC del superadmin no queda copia
  local de la farmacia (no hay "alcance" de usuario) ni se puede vender sin conexión.
- Como soporte no se emiten ni reprocesan comprobantes en ARCA producción (venta con factura
  productiva, notas de crédito, reprocesar, reencolar, emitir un interno, configuración productiva):
  `403 SOPORTE_SIN_ARCA_PRODUCCION`. Homologación sí.
- Una clave pendiente de cambio no frena al soporte (no se cambia la clave de nadie).
- Registro interno: `PlatformAuditLog` con `SOPORTE_ENTRO` y `SOPORTE_SALIO` (quién, a qué
  usuario y farmacia, la sesión). La auditoría de la farmacia no registra nada; lo que se hace
  adentro queda a nombre del usuario, y la hora de entrada y salida permite separarlo.
  La sección Auditoría del panel muestra la farmacia y el usuario de cada registro, y filtra por
  tipo (soporte, cobros y planes, farmacias y usuarios, accesos, ARCA).

### Diseño del panel

El panel usa el mismo lenguaje visual que el sistema de gestión: barra lateral plegable
(`NavigationRail`, grupos Clientes y Herramientas), encabezado con la sección actual, tarjetas
de indicadores con ícono y paneles con título (`platform-ui.tsx`). La sección elegida se recuerda
en la pestaña (`sessionStorage`).

- Farmacias: barra con el estado de las farmacias (al día o en prueba, con aviso, cortadas,
  exentas o de baja) y, en la tabla, el cupo usado de usuarios y sucursales con una barrita.
- Detalle de una farmacia: cabecera con iniciales, estado, fecha de alta y contacto.
- Pagos: gráfico de lo cobrado en los últimos 12 meses (`GET platform/payments` devuelve
  `monthly`, pagos vigentes por mes).
- Planes: un ejemplo calcula el abono de una farmacia de 2 sucursales y 4 usuarios con los
  precios que se están escribiendo (vista previa; el abono real lo calcula la API).

### Comandos

Las cuentas se manejan solo desde el servidor. En el VPS:

```bash
sudo bash deploy/oracle/platform-admin.sh <preprod|prod> crear <correo>
sudo bash deploy/oracle/platform-admin.sh <preprod|prod> revocar <correo>
sudo bash deploy/oracle/platform-admin.sh <preprod|prod> resetear-codigo <correo>
sudo bash deploy/oracle/platform-admin.sh <preprod|prod> listar
```

- `crear` pide la clave sin mostrarla y entra por stdin: un argumento o una variable quedarían
  a la vista en la lista de procesos. Rechaza un correo que ya pertenece a una farmacia.
- `resetear-codigo` es para un celular perdido: no hay códigos de recuperación.
- En local, con la API compilada: `pnpm --filter @gestion/api plataforma listar`. Para crear,
  la clave se pasa por stdin.
- El secreto del código se cifra con `credential-vault.ts`. En producción necesita la clave de
  la bóveda: sin ella el panel queda inaccesible.

La verificación con el código vale 12 horas por sesión. Tras 5 intentos fallidos el código se
bloquea 15 minutos. Un código no se puede usar dos veces.

## Ciclo de cobro y corte

| Etapa        | Cuándo          | Qué pasa                                        |
| ------------ | --------------- | ----------------------------------------------- |
| Exenta       | Siempre         | Sin cobro ni corte                              |
| Prueba       | Hasta fecha fin | Todo habilitado                                 |
| Al día       | Pago imputado   | Todo habilitado                                 |
| En gracia    | Días 1 a 10     | Todo habilitado, con aviso visible              |
| Solo lectura | Días 11 a 29    | No vende; consulta, termina lo pendiente y paga |
| Bloqueada    | Día 30 en más   | Pantalla de pago; el dueño ve sus comprobantes  |

- El estado se calcula por fechas, no se guarda. El corte no depende de un proceso programado
  y un pago reactiva al instante.
- El día comercial cambia a las 06:00 de Argentina, para no cortar a medianoche.
- La gracia no puede bajar de 10 días: Mercado Pago reintenta 4 veces en ese plazo.
- Prórroga manual con fecha y motivo, con auditoría. Solo pausa el corte: al terminar, la
  farmacia vuelve a la etapa que le corresponde por lo que debe, contando desde lo pagado o
  desde el fin de la prueba. No regala días de gracia.
- Cuotas: pago parcial más prórroga hasta la próxima cuota. No hay un sistema de cuotas aparte.
- Los datos nunca se borran. Al bloquearse dejan de generarse cargos; se cobra lo adeudado
  hasta ese día y el resto se condona. Si una bloqueada salda su deuda, los meses que pasó sin
  servicio se generan ya condonados y se le cobra el mes en curso. Sin esto quedaría bloqueada
  para siempre, con saldo cero y sin nada que pagar.

En solo lectura siguen funcionando, además de las lecturas, las operaciones que evitan dejar
algo colgado: procesar facturas y notas de crédito ya creadas (si no, una venta hecha justo
antes del cambio queda sin CAE y frena el punto de venta), cerrar caja e imputar cobranzas
pendientes, recibir transferencias en camino, dar de baja empleados, cambiar claves, vistas
previas y carga inicial del catálogo.

## Módulos

Hoy no corta nada. Se prepara así:

- Catálogo de módulos en `packages/contracts` y tabla `PlatformModule` con precio cero.
- Marca `@RequiresModule` en los controllers, con el mismo chequeo central del corte.
- Una tabla guarda solo las excepciones por farmacia: sin filas, la farmacia tiene todo.
- La marca por ruta no alcanza: `POST sales` factura según el body y `fiscal-options` debe
  devolver vacío, no error. Esos casos se chequean en el servicio.
- Activarlo implica ajustar la landing, que hoy ofrece todas las funciones sin distinguir planes.

## Orden de los PRs

| #   | PR                       | Estado     |
| --- | ------------------------ | ---------- |
| 1   | Alta reutilizable        | Hecho      |
| 2   | Cambio de clave propio   | Hecho      |
| 3   | Identidad de plataforma  | Hecho      |
| 4   | Panel base               | Hecho      |
| 5   | Rol Empleado y permisos  | Hecho      |
| 6   | Modelo comercial y alta  | Hecho      |
| 7   | Cargos, pagos y prórroga | Hecho      |
| 8   | Cupos y catálogo         | SISTEMA-57 |
| 9   | Corte                    | SISTEMA-58 |
| 10  | Límite de sesiones       | Pendiente  |
| 11  | Módulos                  | Pendiente  |
| 12  | Mercado Pago             | Pendiente  |

El corte va después del cobro: primero se ve quién pagó y recién entonces se corta. El límite
de sesiones es condición para cobrar por usuario: sin él, comparten la clave.

## Modelo comercial

- `SubscriptionPlan`: fórmula del abono. La migración crea el plan `ESTANDAR` sin importes;
  los precios se cargan desde el panel, en Planes.
- `OrganizationSubscription`: una fila por farmacia, en una tabla aparte porque `/auth/me`
  devuelve `Organization` entera a cualquier usuario. La migración deja exentas a las farmacias
  que ya existían.
- `subscription-fee.ts` y `subscription-access.ts`: funciones puras con el abono y el estado.
  Hoy el estado solo se muestra: ninguna ruta lo aplica todavía.

## Cargos y pagos

Se cobra mes adelantado: el primer cargo empieza al día siguiente de terminar la prueba y cada
período dura un mes, siempre contado desde esa fecha. Un inicio el 31 cae el 28 en febrero y
vuelve al 31 en marzo.

- **Cargos:** `PlatformBillingService` los genera 5 días antes de que empiece el período. Corre
  al arrancar la API y cada 6 horas, y no duplica. Los comandos de servidor lo apagan con
  `SUBSCRIPTION_SCHEDULER=off`.
- **Importe congelado:** cada cargo guarda su importe y su desglose. Subir precios o cambiar el
  plan rige desde el próximo período, sin prorrateo.
- **Imputación:** `subscription-ledger.ts` reparte los pagos vigentes del cargo más viejo al más
  nuevo, calculando desde cero. No hay tabla de imputaciones: anular un pago no deshace nada.
- **`paidThrough`:** nunca se le suma nada a mano. Se recalcula en la transacción de cada pago,
  anulación o condonación, y también genera lo que falte: un pago reactiva al instante.
- **Pago parcial:** baja el saldo y no adelanta la fecha. Un pago atrasado no reinicia el período.
- **Excedente:** queda a favor y se aplica solo al próximo cargo.
- **Reintentos:** `operationId` más hash. Un doble clic no registra dos pagos, y el mismo
  `operationId` con otros datos da 409.
- **Anular y condonar:** exigen motivo y no borran nada. Una farmacia exenta no registra pagos.
- **Prórroga:** fecha y motivo. Mientras dure no corta, pero los cargos se siguen generando.

En el panel, la ficha muestra cargos, pagos y saldo, y la solapa Pagos muestra quién debe, lo
cobrado en el mes y los últimos 200 pagos de todas las farmacias.

Falta: el pago anual (paga 10, lleva 12) y prorratear una ampliación a mitad de mes. Reactivar
una farmacia suspendida genera los meses que pasó suspendida: hay que condonarlos a mano.

## Cupos

Una farmacia no puede tener más usuarios ni sucursales activos que los que paga. Se controla en
`subscription-quota.ts`, dentro de la transacción, al crear y al reactivar, tanto desde la
farmacia como desde el panel. El panel también lo respeta para que nadie se olvide de cobrar la
ampliación: primero se amplía el plan contratado y después se da el alta.

- Cuentan los usuarios y las sucursales activos. Dar de baja libera el lugar.
- Las exentas no tienen límite, y sin fila de suscripción tampoco: un dato faltante no frena a nadie.
- Bajar el cupo no desactiva a nadie, solo impide altas nuevas.
- El bloqueo va sobre la suscripción, no sobre `Organization`, que frenaría toda escritura con
  clave foránea a la farmacia. Quien además bloquee `Organization` toma primero la suscripción.

La farmacia recibe el motivo en el mensaje de error. La pantalla de uso del plan es otra tarea.

## Corte

`SubscriptionAccessInterceptor` es global y corre después de los guards. A toda ruta con
`:organizationId` le aplica el estado de la farmacia: en solo lectura frena las escrituras y en
bloqueo frena todo, con 402 y código `SUBSCRIPTION_READ_ONLY` o `SUBSCRIPTION_BLOCKED`.

- **Ante la duda deja pasar:** sin suscripción, para quien no es de la farmacia (recibe su error
  de siempre, sin enterarse del estado) y si el chequeo falla. Un error nuestro nunca puede
  cortar a una farmacia que pagó. Las exentas, como Juncos, nunca se cortan.
- **Excepciones marcadas en el código:** `@AllowWhenReadOnly` en lo que termina algo pendiente,
  `@AllowOwnerWhenBlocked` en las ventas y facturas que el dueño sigue viendo, y
  `@AlwaysAvailable` en la consulta del estado, y `@DecidedWhenOccurred` en las ventas hechas
  sin conexión, que se aceptan según el estado que tenía la farmacia cuando ocurrieron
  (`subscriptionAccessAt`; SISTEMA-63). `subscription-routes.spec.ts` fija la lista
  completa y falla si una ruta nueva no lleva `:organizationId` ni está entre las globales.
- **Reactivar:** un pago o una prórroga reactivan al instante, porque el estado se calcula en
  cada pedido.

En la web, `SubscriptionGate` consulta `GET organizations/:id/subscription/status` al entrar,
al renovar la sesión, al volver a la pestaña y cuando una respuesta trae 402 (`apiFetch`
dispara un evento). Si no contesta, deja usar el sistema.

- **Aviso:** un chip en el encabezado, como el de caja, para no cambiar la altura del punto de
  venta. El dueño lo ve desde 5 días antes de vencer y en gracia; en solo lectura lo ven todos y
  no se puede ocultar.
- **Bloqueo:** pantalla con el saldo para el dueño, "Ya pagué, verificar" y sus facturas. El
  empleado solo ve que tiene que avisarle al dueño.
- **Contacto:** `VITE_SUPPORT_WHATSAPP` agrega el enlace de WhatsApp. Sin configurar, no se
  muestra: el dato de contacto todavía no está definido.
- **402 como rechazo:** las pantallas que conservan una solicitud ante un resultado incierto
  tratan el 402 como un rechazo claro, para poder corregirla y reintentarla.

En el panel, la solapa Pagos muestra el próximo corte de cada farmacia que debe.

Falta: suspender o dar de baja a mano desde el panel, avisos por mail y un resumen de lo que
vence en el panel.

## Alta de una farmacia

El panel crea la farmacia y su dueño en una transacción, con una clave temporal que se muestra
una sola vez y obliga a cambiarla al entrar. Lo mismo al agregar un usuario o resetear una clave.
Una sucursal creada desde el panel se asigna a los dueños de la farmacia: quien la crea no
pertenece a ella, y sin eso nadie podría operarla. Su código se genera solo: es un identificador
interno que no sale en tickets, reportes ni facturas.
Una cuenta pertenece a una sola farmacia: un correo que ya existe se rechaza.

`apps/api/src/organizations/organization-provisioning.ts` crea la farmacia con su sucursal
principal, roles, permisos y dueño. Lo usa `bootstrap-production.ts` y lo va a usar el panel.
Quien la llama decide si el alta corresponde, abre la transacción y audita.

El dueño recibe solo el rol OWNER, que cuenta como administrador
(`apps/api/src/roles/administrator-role.ts`).

### Rol Empleado

El alta de farmacias nuevas crea un rol Empleado para el mostrador, porque el rol `USER` no tiene
permisos: ventas, caja, y lectura de catálogo, stock, clientes y cuentas corrientes. El dueño decide por rol quién hace cada parte del circuito de mercadería, y las cuatro
tareas quedan separadas:

| Tarea                   | Permiso            |
| ----------------------- | ------------------ |
| Recibir mercadería      | `PURCHASE_RECEIVE` |
| Comprar mercadería      | `PURCHASE_MANAGE`  |
| Cargar factura o ticket | `PAYABLE_MANAGE`   |
| Registrar el pago       | `PAYABLE_PAY`      |

- **Sin perder acceso:** la migración da `PURCHASE_RECEIVE` a todo rol con `PURCHASE_MANAGE` y
  `PAYABLE_PAY` a todo rol con `PAYABLE_MANAGE`. Farmacia Juncos sigue igual.
- **Recepción con deuda:** recibir acepta `debt`, que crea la factura. Quien solo recibe carga
  el stock; para cargar la deuda necesita `PAYABLE_MANAGE`. La web oculta esos campos.
- **Costos:** quien solo recibe ve qué llega y cuánto, pero no cuánto costó: la API no envía
  los costos. Si el dueño le suma `PURCHASE_READ`, los ve.
- **Compra directa:** exige comprar y recibir, porque hace las dos cosas en un paso.
- **Sucursales y encabezado del ticket:** cualquier miembro activo ve sus sucursales y el nombre
  de la farmacia. Sin eso un rol de mostrador queda trabado en "Cargando permisos". Ver las
  sucursales de toda la organización sigue exigiendo `ORGANIZATION_READ`.
- **Un rol solo para recibir** necesita además `CATALOG_READ` y `PARTY_READ`, para ver los
  productos y el proveedor.
- **Editar permisos de un rol:** `PATCH roles/:roleId/permissions`, con auditoría. El dueño
  activa o desactiva cada tarea desde Administración. El rol `OWNER` no se edita: una farmacia
  nunca debe quedarse sin quien la administre.

## Producción

Producción solo tiene Farmacia Juncos y no se le puede afectar nada:

- Migraciones solo aditivas, con la fila exenta creada en la misma migración.
- Una organización sin fila de suscripción no se corta.
- Las migraciones pausan la API: publicar fuera de horario.
- Primero preproducción. Producción solo con autorización explícita, PR por PR.

## Antes de cobrar a un cliente real

- Averiguar cuánto pagan hoy por los sistemas de la competencia: no publican precios.
- Definir con un contador quién factura y bajo qué categoría. El sistema no puede facturar el
  abono: solo emite bienes atados a una venta (`production-document.ts`, `sourceSaleId`).
- Tener términos de servicio que incluyan el corte.

## Fuera de alcance

Facturar el abono desde el sistema, mail, recuperación autónoma de clave, pago en autoservicio,
segundo factor para usuarios de farmacia, selector de varias
farmacias, demos gratis y asistente de primer uso.
