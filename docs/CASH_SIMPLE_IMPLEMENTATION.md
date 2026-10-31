# Caja simple: implementación por etapas

## Decisiones confirmadas (17/10/2026)

- Conservar Eliminar cierres: archivo recuperable y auditado, nunca borrado físico.
- Permitir cobrar efectivo, tarjeta y transferencia sin sesión y marcar esos cobros para asignación posterior explícita. Conservar fecha original, autor y sucursal. La asignación no registra otra venta/cobro y sólo el efectivo afecta el efectivo esperado. Implementado localmente en la segunda etapa.
- Reutilizar CashService, CashRegister, CashSession, CashMovement y los circuitos existentes de ventas/cuenta corriente.

## Etapa implementada: conteo y seguridad del cierre

- Formulario integrado en Cierre pendiente, sin modal, con efectivo contado vacío, diferencia y motivo obligatorio si no coincide. Confirmación adicional si hay faltante/sobrante. No crea movimientos ficticios.
- Backend vuelve a calcular el efectivo con el circuito existente y exige motivo. El cliente envía el saldo esperado mostrado: se rechaza si cambió mientras se contaba.
- Cierre y escritores de caja (venta, cancelación, cobro de cuenta corriente, devolución fiscal y movimiento manual) toman el mismo bloqueo de fila antes de comprobar la sesión. El cierre valida la sesión dentro de la transacción, evitando cierres repetidos.
- Apertura auditada. Movimientos manuales admiten un UUID de solicitud opcional, usado como ID del movimiento existente: reintentar la misma solicitud no crea otra fila/auditoría; reutilizarla con otro contenido se rechaza. El frontend conserva ese UUID ante error mientras el contenido no cambie y bloquea doble clic durante el envío. Clientes anteriores sin UUID conservan compatibilidad.
- La interfaz respeta CASH_MANAGE para apertura/cierre/movimiento. El backend sigue siendo autoridad.
- No cambia el cálculo actual ni las tablas. No requiere migración. El archivo/restauración de cierres se conserva.

## Configuración implementada (18/10/2026)

- Tres pestañas: Cajas, Reglas operativas y Cierres y arqueos. Las reglas se guardan por sucursal, con permisos, auditoría y versión para rechazar cambios concurrentes. Los cambios sin guardar se deben guardar o descartar antes de salir de la configuración.
- Migración aditiva `20261018000000_cash_operational_settings`: código único por sucursal y configuración persistente. Aplicada únicamente en desarrollo local. Nuevas cajas admiten código explícito o generado; las existentes reciben código sin alterar sus operaciones.
- Reglas: permitir ventas/cobros sin sesión, solicitar fondo inicial, exigir motivo manual, permitir movimientos manuales y caja predeterminada. Los valores iniciales mantienen el comportamiento anterior. La API impone las reglas en ventas, recibos, apertura y movimientos, no sólo React.
- La caja predeterminada debe estar habilitada y pertenecer a la sucursal. Se bloquea su desactivación hasta cambiar esa preferencia. Desactivar solicitud de fondo inicial obliga a iniciar en cero.
- Los nuevos cierres guardan nombres de caja, apertura y cierre en la auditoría. Historial y detalle priorizan importes auditados. Los registros anteriores conservan el respaldo disponible; no se inventan datos históricos.
- La confirmación final usa el diálogo del sistema también sin diferencia. El formulario sigue integrado y compacto. El destino de cobros pendientes ocupa 160 px y conserva búsqueda y navegación por teclado.

## Verificación final de la primera versión (18/10/2026)

- La consulta operativa devuelve todas las sesiones abiertas, separadas de los últimos veinte registros cerrados. Una sesión abierta antigua ya no desaparece por actividad posterior de otras cajas.
- Caja cerrada muestra el último cierre visible de la caja seleccionada, con fecha, contado, responsable y acceso al detalle existente. La consulta respeta sucursal y permisos, excluye archivados y no depende de los filtros ni de los treinta días predeterminados del historial. Tiene estados de carga, vacío, error y reintento.
- Pruebas PostgreSQL con dos clientes independientes en un esquema sintético: doble apertura, doble cierre, reintento simultáneo de movimiento, cierre contra movimiento, asignación repetida y cierre contra asignación. También cubren sesión abierta antigua, último cierre antiguo y exclusión de otra caja/archivados. El esquema de prueba se elimina al finalizar; no se borran registros comerciales.
- Integración fiscal con ARCA simulado y rollback local: cobro mixto sin caja, devolución parcial en efectivo, rechazo de devolución sin sesión, reintento de liquidación y asignación posterior del cobro. Se verifica una salida, una entrada de efectivo y conservación de los pagos originales sin sumar transferencia al efectivo. No se contacta ARCA ni se habilita producción.
- Comprobación de navegador con API simulada: último cierre, importe/fecha, acceso a detalle, cambio de caja sin datos anteriores, vacío/error, ayuda desplegable y ausencia de desborde a 390 px. No sustituye una validación de uso real en producción.

## Fuera del alcance de esta versión

- Impresión de cierre sólo tras verificar/adaptar un comprobante compatible; no existe aún una opción nueva para activarla. No se agrega arqueo parcial.
- Despliegue y validación operativa en producción requieren una etapa explícita; esta entrega es local.

## Ajuste de asignación y navegación

- Asignar caja utiliza un selector compacto con buscador en la fila del mismo diálogo. La lista flota sin aumentar la fila; la elección se confirma explícitamente en un pie compartido. Cancelar descarta la selección sin escribir. Incorporar a sesión usa el mismo patrón y los endpoints existentes; no abre cajas automáticamente ni apila ventanas.
- Volver a consultar conserva la tabla mientras actualiza y bloquea confirmar durante la consulta. El borrador de elección se conserva al navegar dentro del ámbito montado; no es una asignación guardada ni sobrevive a recargar la aplicación. Si el cobro desapareció o cambió de destino en el servidor, se descarta ese borrador. Sólo confirmar persiste la operación.
- Comprobación de navegador con API simulada: fila estable, selección sin escrituras, conservación del borrador al salir/volver, un único envío ante doble clic y destino confirmado visible antes/después de actualizar, también en ancho móvil.

## Consulta de cierres y selector (18/10/2026)

- El destino reutiliza SearchableSaleSelect con búsqueda, navegación por teclado y lista flotante. No se escribe hasta confirmar, no se apilan ventanas y no se abren sesiones automáticamente.
- Historial agrega Ver cierre, conservando Eliminar/Restaurar. Endpoint de sólo lectura `GET cash/closures/:sessionId`: exige CASH_READ, sucursal y sesión cerrada; cierres archivados sólo para ADMIN. Muestra apertura/cierre, responsables disponibles, motivo, importes y registros de efectivo. Tarjeta/transferencia no se suman al efectivo.
- El esperado guardado en auditoría CLOSED tiene prioridad en el detalle. Si falta, se indica explícitamente que se reconstruyó con los registros disponibles. El responsable de cierre ausente se muestra como no registrado, sin deducirlo del usuario actual. No modifica documentos históricos ni requiere migración.
- La tabla general y el detalle priorizan el esperado auditado; los datos antiguos sin instantánea se reconstruyen con los registros disponibles.

## Segunda etapa: cobros pendientes de caja

- Ajuste de interfaz: acceso permanente desde los tres puntos a la derecha de Abrir caja/Cierre pendiente, con lista en diálogo. El cierre con diferencia usa un diálogo propio, muestra esperado/contado/diferencia/motivo y conserva una instantánea para la validación del servidor. Se reemplaza `window.confirm`.
- Migración aditiva `20261017010000_pending_collection_destination`: permite asignar caja de destino sin sesión. Esta operación no abre caja ni mueve dinero. Se conserva visible como pendiente de incorporar; la incorporación explícita posterior valida que la sesión pertenezca a ese destino. No se reasignan destinos automáticamente. Se bloquea deshabilitar cajas con destinos pendientes.
- Caja se conserva montada al navegar dentro de la misma organización/sucursal y refresca al volver sin vaciar sus bloques. Al cambiar el ámbito se remonta; los diálogos de pendientes no se mantienen abiertos al abandonar Caja.

- Migración aditiva `20261017000000_cash_pending_collections`: registro por venta/recibo, fecha, autor, sucursal, desglose por medio, vuelto, asignación y anulación. No migra ni reasigna pagos históricos automáticamente.
- La creación usa la transacción existente de ventas/cuenta corriente. La asignación explícita usa bloqueos de venta, cobro pendiente y sesión; repetir la misma asignación devuelve el resultado original. Otra sesión, otra sucursal, una sesión cerrada o un cobro anulado se rechazan. No modifica pagos ni créditos originales.
- Efectivo neto produce una única entrada de caja; tarjeta/transferencia sólo quedan vinculadas por el registro y la auditoría. El panel muestra la fecha original y solicita confirmación para la caja abierta actual.
- Anular una venta pendiente la marca anulada; si ya fue asignada, compensa el efectivo neto en la sesión abierta. Se impide anular contra una sesión cerrada. Las devoluciones fiscales conservan su circuito separado: no se asignan ni compensan automáticamente.
- Aplicar primero la migración y API, luego el frontend. Sólo se aplicó en la base local de desarrollo; no se publicó en producción.
- Pruebas unitarias de medios/vuelto, reintentos, permisos de sesión y anulación; integración PostgreSQL con fixtures revertidos para creación, asignación repetida y compensación. La verificación final agrega concurrencia y el cruce fiscal descritos arriba.
- La configuración posterior permite deshabilitar los nuevos cobros sin sesión por sucursal; no altera los cobros pendientes existentes.
