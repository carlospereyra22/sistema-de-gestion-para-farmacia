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
- El panel muestra solo datos comerciales: sin ventas, clientes ni stock, y sin entrar como
  una farmacia. La landing promete "Cada farmacia ve solo sus datos".

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
- Prórroga manual con fecha y motivo, con auditoría.
- Cuotas: pago parcial más prórroga hasta la próxima cuota. No hay un sistema de cuotas aparte.
- Los datos nunca se borran. Al bloquearse dejan de generarse cargos; se cobra lo adeudado
  hasta ese día y el resto se condona.

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

| #   | PR                      | Estado     |
| --- | ----------------------- | ---------- |
| 1   | Alta reutilizable       | Hecho      |
| 2   | Cambio de clave propio  | SISTEMA-49 |
| 3   | Identidad de plataforma | SISTEMA-50 |
| 4   | Panel base              | Pendiente  |
| 5   | Rol Empleado y permisos | Pendiente  |
| 6   | Modelo comercial y alta | Pendiente  |
| 7   | Cargos y pagos manuales | Pendiente  |
| 8   | Corte                   | Pendiente  |
| 9   | Límite de sesiones      | Pendiente  |
| 10  | Módulos                 | Pendiente  |
| 11  | Mercado Pago            | Pendiente  |

El corte va después del cobro: primero se ve quién pagó y recién entonces se corta. El límite
de sesiones es condición para cobrar por usuario: sin él, comparten la clave.

## Alta de una farmacia

`apps/api/src/organizations/organization-provisioning.ts` crea la farmacia con su sucursal
principal, roles, permisos y dueño. Lo usa `bootstrap-production.ts` y lo va a usar el panel.
Quien la llama decide si el alta corresponde, abre la transacción y audita.

El dueño recibe solo el rol OWNER, que cuenta como administrador
(`apps/api/src/roles/administrator-role.ts`).

### Rol Empleado

El alta de farmacias nuevas crea un rol Empleado con venta y caja, porque el rol `USER` no tiene
permisos. El dueño decide por rol quién hace cada parte del circuito de mercadería, y las cuatro
tareas quedan separadas:

| Tarea                   | Permiso            | Hoy                                     |
| ----------------------- | ------------------ | --------------------------------------- |
| Recibir mercadería      | `PURCHASE_RECEIVE` | Nuevo: está dentro de `PURCHASE_MANAGE` |
| Comprar mercadería      | `PURCHASE_MANAGE`  | Existe                                  |
| Cargar factura o ticket | `PAYABLE_MANAGE`   | Existe                                  |
| Registrar el pago       | `PAYABLE_PAY`      | Nuevo: está dentro de `PAYABLE_MANAGE`  |

- **Sin perder acceso:** la migración da `PURCHASE_RECEIVE` a todo rol con `PURCHASE_MANAGE` y
  `PAYABLE_PAY` a todo rol con `PAYABLE_MANAGE`. Farmacia Juncos sigue igual.
- **Recepción con deuda:** recibir acepta `debt`, que crea la factura. Quien solo recibe carga
  el stock; para cargar la deuda necesita `PAYABLE_MANAGE`. La web oculta esos campos.
- **Editar permisos de un rol:** `RolesController` solo lista y crea. Se agrega la edición con
  auditoría, y el dueño activa o desactiva cada tarea desde Administración.

A definir en el PR: si quien solo recibe ve los costos de la compra, y qué exige la compra
directa, que compra y recibe en un solo paso.

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
entrar como una farmacia, segundo factor para usuarios de farmacia, selector de varias
farmacias, demos gratis y asistente de primer uso.
