# Cuentas por pagar a proveedores — auditoría y propuesta

Estado: etapa 1 implementada el 20/10/2026, tras aprobar la propuesta. El documento de alcance solicita aprobación entre etapas; pagos, estado de cuenta del proveedor y avisos de Inicio siguen pendientes de sus etapas correspondientes.

## Hallazgos

- Compras V2 está integrada: Purchase/PurchaseItem, PurchaseReceipt/PurchaseReceiptItem; no hay una migración pendiente. `prisma migrate status` informa 54 migraciones aplicadas.
- No se encontraron modelos/servicios equivalentes a facturas, pagos o cuenta corriente de proveedores. SupplierReturn es una devolución física, no un crédito administrativo.
- Supplier es un catálogo por organización con UUID y estado activo. PartiesService aplica PARTY_READ/PARTY_MANAGE. La pantalla Proveedores usa el componente Parties de workspace-shell y no tiene un estado de cuenta financiero.
- Compras usa PURCHASE_READ/PURCHASE_MANAGE y acceso de UserBranch; pagos y deudas requieren permisos separados para no otorgar capacidades financieras por poder recibir mercadería.
- Los importes existentes usan BigInt en centavos y respuestas JSON en texto. Se conserva ARS; no se introduce moneda extranjera.
- Caja usa CashSession/CashMovement y cuentas de clientes tienen servicios propios: ninguno se debe importar para escribir desde Cuentas por pagar.
- Las fechas civiles de cuentas de clientes usan America/Argentina/Buenos_Aires. Se puede reutilizar el criterio de calendario, sin reutilizar sus registros ni saldos.
- La referencia de una compra es descriptiva, no una factura ni un identificador fiscal validado. No se debe convertir automáticamente en deuda.

## Propuesta por etapas

1. Facturas y vencimientos: acceso Cuentas por pagar dentro de Compras, listado paginado al pie, creación manual o explícita desde una compra, detalle y filtros. Vínculo opcional con 0/1 compra, permitiendo varias facturas por compra. Incluir desde esta etapa la carga opcional de múltiples vencimientos y validación de su suma, sin simular cuotas.
2. Pagos administrativos: abonos parciales/totales, asignación a vencimientos más antiguos, bloqueo transaccional por factura, idempotencia y anulación auditada con motivo. El estado y saldo se derivan de los registros vigentes; no se mantiene otro saldo editable en Supplier.
3. Estado de cuenta en Proveedores y avisos discretos en Inicio, consultando los mismos documentos y sólo sucursales autorizadas.
4. Notas de crédito administrativas como fase separada, tras aprobar el circuito básico. Adjuntos y pagos distribuidos entre facturas quedan pendientes; no se agregan bancos, ARCA ni movimientos de Caja.

Antes de cada etapa siguiente: informar pruebas y solicitar aprobación, según el documento del usuario.

## Archivos y migraciones propuestos

- Backend nuevo `apps/api/src/supplier-payables/`: módulo, controlador, DTOs, servicio y funciones de fechas/importes/saldos. Registro en `apps/api/src/app.module.ts`.
- Modelos nuevos en `apps/api/prisma/schema.prisma`: SupplierPayableInvoice, SupplierPayableDue y, en etapa 2, SupplierPayablePayment y asignaciones a vencimientos.
- Migraciones nuevas, aditivas, con claves foráneas y controles de pertenencia a organización/sucursal/proveedor/compra; no editar migraciones ejecutadas ni transformar compras antiguas. Si hacen falta índices compuestos en entidades existentes para las referencias seguras, agregarlos sin cambiar sus datos.
- Restricción única de comprobante por organización/proveedor/tipo/punto/número normalizado, conservando número original y ceros. Idempotencia por solicitud. Tipos de factura y Otro documento de deuda; ningún remito genera deuda automáticamente.
- Permisos propuestos PAYABLE_READ/PAYABLE_MANAGE y PAYABLE_PAYMENT_MANAGE, registrados en migración/seed y etiquetas de roles. Asignación inicial sólo a administradores; los roles personalizados se habilitan explícitamente.
- Frontend nuevo `apps/web/src/supplier-payables/` y cliente API propio. Cambios acotados en purchases-workspace y workspace-shell para accesos, no para recalcular recepción ni stock.
- Tests unitarios y de integración en esquema PostgreSQL sintético; documentación de reglas y arquitectura cuando se apruebe la implementación.

## Riesgos y decisiones

- Factura obligatoriamente asociada a una sucursal autorizada, aunque no tenga compra. El estado del proveedor puede agregar varias sucursales sólo cuando el usuario tiene acceso a ellas; no presentar un total parcial como total organizacional completo.
- Factura y compra pueden tener importes diferentes. Mostrar la diferencia sin modificar costos ni cantidades históricas.
- Sin vencimiento debe ser una elección explícita; fechas DATE, no comparación de instantes UTC. El importe vencido comprende sólo cuotas impagas exigibles.
- Anular pagos recompone sus aplicaciones y conserva documentos originales. No borrar históricos ni marcar una compra pagada por su recepción.
- Respaldo nuevo antes de aplicar cualquier nueva migración local; el respaldo de Compras V2 no sustituye uno actualizado. Probar migraciones en esquema aislado antes de la base de uso local. No se autoriza despliegue productivo por esta propuesta.
- No hay conflictos de migraciones detectados en la comprobación actual. Revalidar estado antes de implementar.

## Verificación realizada

- Lectura del prompt de cuentas por pagar y del de Compras V2, instrucciones locales y documentación del proyecto.
- Inspección de esquema, permisos, servicios y puntos de entrada UI existentes.
- `prisma migrate status`: base local al día, 54 migraciones.
- `jest --runInBand test/purchase-receipts.integration.spec.ts`: 11 pruebas aprobadas en esquema sintético aislado.
- No se crearon facturas, pagos, tablas ni permisos nuevos en esta etapa. No se hicieron escrituras sobre stock/caja comerciales. No se afirma todavía implementada ninguna función de Cuentas por pagar.

## Ampliación aprobada: recepción y deuda en un paso (20/10/2026)

Precarga del ajuste de recepción: antes de indicar cantidades, el campo muestra el estimado del saldo de mercadería pendiente, identificado como provisional. Al cargar cantidades usa exclusivamente lo recibido; editar el importe manualmente conserva ese valor. La vista previa provisional no se envía como deuda automáticamente: la confirmación sigue exigiendo cantidades recibidas y calculando el importe de esa entrega, salvo ajuste explícito.

Prevención de duplicados al recibir: una deuda manual vinculada a la compra (sin receiptId) suprime la propuesta de nueva deuda en recepción y muestra sólo «Deuda ya registrada». Se consulta el detalle actualizado al abrir; el servidor revalida bajo bloqueo de compra y rechaza solicitudes viejas que intenten agregar deuda. Registro manual vinculado y recepción comparten ese bloqueo. Deudas de otras recepciones no bloquean las entregas posteriores. No se infiere pago ni se compensan saldos: si la deuda manual era parcial, otra obligación se registra explícitamente desde Cuentas por pagar. Una deuda sin vínculo a compra no se puede asociar por coincidencia de proveedor. El formulario sin deuda previa resume importe/fecha en una línea y deja ajustes plegados; no muestra $0 antes de cargar cantidades.

Registrar deuda desde una compra precarga su importe estimado completo, editable (no representa un saldo conciliado ni descuenta otras facturas). Elegir otra compra actualiza la sugerencia. Recuperar un borrador con importe escrito o solicitud enviada conserva sus datos; un borrador vacío puede tomar el estimado vinculado. Vencimiento usa un selector compacto de fecha única, sin fecha o cuotas, con acceso al plazo del proveedor.

Corrección de vencimiento manual: las opciones de proveedor incluyen su condición y plazo. Al elegir proveedor en Registrar deuda (o abrir desde una compra), se sugiere fecha de registro + plazo. Cambiar fecha recalcula sólo la sugerencia automática; una fecha/modo elegido manualmente se conserva. Los borradores recuperados no se sobrescriben: «Usar plazo del proveedor» permite aplicar la sugerencia explícitamente. No modifica deudas ya registradas. Regresión cubierta para 15 días, cero días, sin plazo y consulta API de configuración.

Esta decisión posterior reemplaza la exigencia original de registrar siempre la factura en otra pantalla. Los apartados siguientes conservan el contexto de la etapa inicial.

- Proveedores: condición Contado/Cuenta corriente y plazo opcional 0–3650 días; vacío sin vencimiento, cero vence hoy. Edición con PARTY_MANAGE, versión esperada y auditoría; no altera historial.
- Recibir mercadería y compra directa: opción visible **Dejar pendiente de pago**, sugerida para proveedores con cuenta corriente. Importe de las cantidades efectivamente recibidas, editable; vencimiento opcional. Desmarcar si ya está pagado o la obligación ya está registrada. No supone ni registra un pago.
- Recepción, stock, deuda, vencimientos y auditoría se confirman en una transacción. Un error revierte todo. Reintentar exactamente la misma solicitud no duplica. PAYABLE_MANAGE es necesario además del permiso de Compras para confirmar deuda.
- Cada recepción tiene como máximo una deuda vinculada. Las entregas parciales sucesivas pueden originar deudas separadas. No se consolidan automáticamente facturas previas ni se detectan duplicados de documentos sin número ingresados deliberadamente como operaciones nuevas; revisar la opción antes de confirmar.
- **Registrar deuda** manual: proveedor, importe y vencimiento; tipo, punto y número quedan plegados como opcionales. Sin comprobante se guarda clave documental nula, no numeración fiscal ficticia. Con número se conserva el control de duplicados.
- Sin conversión retroactiva ni cambios de Caja, precios o cuentas de clientes. Pagos, anulación y créditos siguen fuera de esta entrega.
- Migración aditiva `20261020010000_supplier_receipt_debt`, probada en esquemas sintéticos y aplicada localmente (56 migraciones). Respaldo previo `compras-v2-20261020-205454.dump`, 372084 bytes, índice verificado; no se ensayó restauración integral ni se desplegó producción.
- Pruebas nuevas: recepción parcial con deuda, concurrencia/reintento, recepción sin deuda, reversión total por importe inválido o falta de permiso, compra directa con importe ajustado, configuración de proveedor sin efectos retroactivos y deudas manuales sin número. Todas las pruebas de integración usan esquemas aislados.
- Revisión visual Edge a 1366×768 y ancho móvil de 390px con respuestas simuladas: deuda sin número, proveedor se cierra al elegir, selección de cuenta corriente/plazo y desmarcado de deuda. Capturas `.cache/receipt-manual.png`, `.cache/receipt-receive.png`, `.cache/receipt-supplier.png` y `.cache/receipt-mobile.png`. Fixture temporal retirado; no se hicieron operaciones comerciales de prueba en la base real.
- Verificación: formato de archivos modificados, lint y typecheck correctos; build correcto con advertencia de tamaño de bundle. Suite completa: 455 API, 528 web y 18 impresión aprobadas. Migraciones al día y health local OK. Producción no desplegada.

## Etapa 1 implementada

La información de auditoría anterior describe la etapa 0. La primera implementación agrega:

- Acceso **Cuentas por pagar** en el encabezado de Compras, sin otro apartado lateral. Conserva Historial, pedidos y recepción. **Volver a Compras** recupera el contexto del listado.
- Listado con búsqueda, proveedor, vencidas/hoy/próximos 7 o 30 días/sin vencimiento. Orden por vencimiento, importe total del listado y sólo el saldo de cuotas realmente vencidas. Paginación al pie y scroll de tabla independiente.
- Formulario de 760 px, proveedor buscable, tipo, punto/número, emisión, importe real, vínculo opcional y observaciones plegadas. Una fecha, Sin vencimiento definido o varios vencimientos (hasta 36), con suma exacta validada en servidor.
- Desde el detalle de la compra, **Registrar factura** precarga proveedor y vínculo, pero no confirma número ni importe estimado. Si hay otro borrador, se recupera y se avisa; no se pisa. Los importes diferentes se muestran como diferencia, no corrigen la compra.
- Detalle con proveedor, comprobante, saldo, vencimientos, autor y consulta a la compra relacionada.
- Borrador por usuario/organización/sucursal en sessionStorage, recuperación tras recargar y solicitud inmutable para reintentar después de una respuesta incierta. Salir permite conservar o descartar; el envío incierto no se descarta. El borrador no es compartido entre equipos y puede perderse al cerrar la pestaña/borrar almacenamiento.

### Persistencia y permisos

`SupplierPayableInvoice` y `SupplierPayableDue`, migración `20261020000000_supplier_payable_invoices`. Los índices compuestos adicionales de Supplier/Purchase sólo permiten claves foráneas seguras; no cambian recepciones ni documentos históricos. La suma de vencimientos también tiene un constraint diferido en PostgreSQL.

Permisos **PAYABLE_READ** y **PAYABLE_MANAGE**, asignados inicialmente sólo a roles ADMIN existentes; seed y etiquetas UI actualizados. Los roles personalizados se habilitan explícitamente. El acceso exige membresía activa y UserBranch en la organización/sucursal indicada.

API bajo `/api/v1/organizations/:organizationId/branches/:branchId/supplier-payables`:

- GET listado filtrado/paginado y totales.
- GET `/options` proveedores y compras de la sucursal, para cargar el documento.
- GET `/:id` detalle.
- POST registro atómico de factura, vencimientos y auditoría.

Importes BigInt en centavos y strings JSON; conversión decimal exacta en el cliente, sin flotantes. Fechas civiles DATE interpretadas con calendario de Argentina. Duplicados bloqueados por organización/proveedor/tipo/identidad normalizada de punto y número, conservando la escritura de ceros del comprobante. Una compra puede tener varias facturas. Clave de operación única por organización, con huella y bloqueo transaccional; otra sucursal no puede reutilizarla para consultar un documento ajeno.

### Límites de la primera entrega (históricos)

- Todas las facturas registradas comienzan pendientes por el importe completo. **No registrar aquí documentos ya saldados esperando que aparezcan pagados**: los pagos se agregan en la etapa 2. El listado lo aclara y no ofrece botones de pago ficticios.
- En esta etapa no se editan, eliminan ni anulan documentos confirmados. Revisar los campos antes de registrar; cualquier ampliación de correcciones debe ser auditada, sin borrar historial.
- No se implementaron todavía pagos, anulación de pagos, notas de crédito, resumen desde Proveedores ni alertas en Inicio. Tampoco adjuntos, moneda extranjera, emisión fiscal ni efectos de Caja/inventario.
- La consulta actual filtra/totaliza los documentos de la sucursal en el servidor y pagina la respuesta. Para volúmenes grandes, conviene trasladar agregaciones/filtros a SQL antes de ampliar uso masivo; no hay truncamiento oculto.

### Respaldo y despliegue local

Se creó un nuevo respaldo antes de migrar: `%LOCALAPPDATA%/FarmaciaJuncos/RespaldosLocales/compras-v2-20261020-150237.dump` (358992 bytes), índice verificado con pg_restore --list. Se corrigió el script local para aplicar sólo la ACL de acceso sin intentar cambiar el propietario, evitando requerir SeSecurityPrivilege. No se hizo una restauración integral.

La migración se probó primero en esquema aleatorio y luego se aplicó sólo a gestion_dev. Hay 55 migraciones locales aplicadas. Producción no fue desplegada. Para otro entorno: respaldo actualizado, ensayo de restauración y migración, Prisma generate, migrate deploy y despliegue coordinado. No ejecutar seed para sobrescribir configuración comercial ni modificar esta migración aplicada. Ante falla, suspender escrituras nuevas y corregir hacia adelante; no borrar las nuevas tablas con facturas registradas.

### Guía breve

1. Compras → **Cuentas por pagar** → **Nueva factura**.
2. Elegir proveedor, tipo y número; cargar emisión e importe real.
3. Elegir una fecha, sin fecha explícita o **Dividir en vencimientos**; la suma debe coincidir con el total.
4. Revisar y pulsar **Registrar factura**. No se recibe mercadería ni se paga nada.
5. Para ver qué vence, usar el filtro del listado. En varias cuotas, el importe vencido incluye sólo las fechas anteriores a hoy.
6. Si hubo una interrupción, **Continuar factura → Reintentar misma solicitud**, sin crear otra para el mismo comprobante.

### Pruebas de la etapa

- Integración PostgreSQL en esquema sintético con todas las migraciones: manual/sin compra, vínculo con compra parcial y más de una factura, deuda exacta, conservación de compra/stock/Caja, duplicados simultáneos y reintentos, permisos/tenant/sucursal, cuotas, y restricciones de base.
- Unitarias: fechas civiles y medianoche UTC, fechas inválidas, total de vencimientos, normalización de comprobantes, validación DTO y filtros, formato monetario y centavos exactos.
- Navegador Edge headless a 1366×768, con API simulada: selección de proveedor, error de suma sin POST, dos vencimientos, doble clic, interrupción/recarga/reintento idéntico y detalle. Capturas locales `.cache/payables-list.png`, `.cache/payables-editor.png` y `.cache/payables-detail.png`.
- Las pruebas no registraron facturas sintéticas sobre la base comercial. Los archivos temporales de la web fueron retirados al terminar.

### Etapa 2: pagos a proveedores

Desde el listado o el detalle, **Registrar pago** propone el saldo completo y permite modificarlo para registrar un pago parcial. Se indica fecha y medio informativo (transferencia, efectivo, cheque u otro), con referencia opcional. Esto registra un pago ya realizado: no envía dinero ni modifica Caja, stock o precios.

El saldo y el estado se calculan descontando solamente pagos vigentes. Los pagos se distribuyen primero entre vencimientos fechados más antiguos, luego los que no tienen fecha; el formulario permite revisar ese reparto. Una deuda saldada deja de figurar vencida. El listado permite filtrar pendientes, parciales y saldadas.

El detalle conserva el historial con operador, fecha, medio y referencia. **Anular pago** exige motivo y restituye sus saldos, conservando el pago y la auditoría; no devuelve dinero. No se permite borrar deudas ni pagos históricos.

Cada pago tiene operación idempotente y huella. El bloqueo transaccional por deuda y la comparación del saldo esperado impiden sobrepagar desde dos pantallas. Las solicitudes interrumpidas se conservan en la sesión para verificar/reintentar sin duplicar. Reintentar un pago posteriormente anulado no lo reactiva. Los permisos son PAYABLE_READ y PAYABLE_MANAGE, con aislamiento por organización y sucursal.

Migración nueva: `20261021000000_supplier_payments`, con asignaciones en centavos, claves compuestas y restricciones diferidas para impedir asignaciones incompletas o saldos negativos. Pruebas de integración en esquema aislado cubren pagos completos/parciales, concurrencia, reintentos, anulación, vencimientos, fechas, permisos y ausencia de efectos en Caja/stock.

Pendientes fuera de esta etapa: notas de crédito, estado de cuenta dedicado desde Proveedores, alertas en Inicio e integración de pagos con Caja/bancos. El filtro por proveedor permite consultar sus deudas en Cuentas por pagar.

Verificación local de etapa 2: 463 pruebas API, 537 web y 18 de impresión aprobadas; lint, typecheck y build aprobados (build conserva advertencia de tamaño de bundle). Navegador Edge a 1366×768 con API simulada: saldo precargado, actualización de saldo parcial y envío/limpieza de solicitud; captura `.cache/payment-editor.png`. Se retiró la página temporal. Respaldo `compras-v2-20261021-143808.dump`, 375302 bytes, índice legible verificado, sin ensayo completo de restauración. Migración aplicada únicamente a gestion_dev: 57 migraciones. No se desplegó producción ni se registraron pagos sintéticos en la base comercial.
