# Compras y recepciones — ampliación V2

## Auditoría previa

Stack: React/TypeScript/Vite/Tailwind, NestJS REST, Prisma/PostgreSQL; monolito modular existente.

- Existe: `Purchase` y `PurchaseItem` con cantidades pedidas/recibidas y costos históricos. `POST purchases` ya admite varias líneas, pero `Purchases` en workspace-shell enviaba sólo una.
- Existe incompleto: `PurchasesService.receive` acredita ProductLot y crea InventoryMovement dentro de una transacción; calcula PARTIALLY_RECEIVED. Le faltaban bloqueo de compra, idempotencia y agrupación de recepciones.
- Falta: formulario amplio, recepción conjunta/multilote, historial por entrega, cierre explícito de saldo, metadata de comprobante y creación directa.
- Historial existente: OperationHistory usa getPurchases y filtros locales. Se conserva su consulta y se extiende la información.
- Inventario independiente conserva sus endpoints y permisos. No se reemplaza su motor ni se crean compras automáticas por ingresos manuales.

## Plan mínimo

1. Extender aditivamente el modelo sin recalcular stock histórico; respaldar la base local antes de aplicar migraciones.
2. Reutilizar creación multiartículo y acreditación transaccional; bloquear cada compra y registrar una clave por entrega.
3. Reemplazar únicamente el formulario limitado por un editor amplio y recepción conjunta revisable.
4. Probar regresión 200 unidades, entregas 100/60/40, multilote, errores atómicos, concurrencia, permisos y precios intactos.

El catálogo actual no tiene una bandera de lote/vencimiento obligatorio por tipo. Se conserva su política: lote identificado obligatorio y vencimiento opcional; no se inventan exigencias por nombre del producto. Los vencidos siguen siendo stock físico no vendible.

Las recepciones históricas no se recrean. Sus movimientos/auditorías se consultan como legado; sólo las nuevas entregas tienen cabecera y desglose propios.

## Implementación y pantallas

- Recibir una compra pendiente (02/11/2026): la acción principal del listado
  abre directamente una vista amplia dentro de Compras. El botón muestra Recibir
  o Continuar recepción según el borrador; Ver detalle y Cancelar quedan en su
  desplegable. Las compras ya recibidas o cerradas muestran sólo Ver detalle.
  La recepción de una compra directa usa la misma vista después de
  cargar sus productos. Volver a Compras conserva el borrador en la pestaña,
  que se retoma desde la misma compra. Nueva compra conserva su nombre en el
  listado; si hay una recepción en curso, pide confirmar antes de descartarla.
  La confirmación
  de salida sólo aparece al elegir Descartar borrador. Se mantienen las mismas
  validaciones, la clave de operación, el reintento y la confirmación de deuda.
  Ver detalle puede abrirse aunque haya un borrador guardado: el detalle no
  modifica ese borrador, y cerrarlo vuelve al listado sin descartarlo.
  Los tres indicadores quedan sobre el panel y usan la misma escala visual que
  los indicadores de Productos: línea superior, separadores, icono circular,
  cifra y etiqueta. Dentro, los productos y sus lotes
  se cargan en una tabla con encabezados visibles. La barra de confirmación está
  fuera del área desplazable y tiene fondo opaco. Los avisos informativos usan
  un tratamiento neutro, separado del color de las acciones.
  Cada fila muestra cantidades pedidas, ya recibidas y pendientes, además del
  avance ya confirmado. Los lotes adicionales conservan filas propias y su
  acción de agregado se presenta como texto discreto.
- Compras conserva el encabezado compacto con icono, Nueva compra e Historial, sin KPIs. El listado tiene filtros de producto/código/proveedor/referencia, estado y fechas, y paginación integrada.
- Importar archivo de droguería (02/11/2026): en Nueva compra (pedido
  pendiente o compra directa), el botón Importar archivo (a la izquierda de la
  X) lee un Excel `.xlsx` de hasta 5 MB o una factura PDF de hasta 15 MB en el
  navegador, sin subirlos al servidor. La cantidad es la pedida: lo recibido se
  registra después, en la recepción. Detecta la hoja y las columnas de código,
  producto, cantidad y costo por sus encabezados y por el contenido: cada
  droguería arma su Excel distinto, así que el código de barras tiene que ser
  una columna de 8 a 14 dígitos, el nombre una de texto y se prefiere la fila
  de encabezados que tiene productos debajo (no la cabecera de la factura).
  Si no acierta, se eligen a mano. Una revisión muestra cada fila: se asocia sola por código de barras o
  por nombre exacto de un producto activo en la sucursal; si el código de barras
  no existe en el catálogo no se adivina por nombre. Las filas ambiguas o sin
  producto se vinculan a mano buscando en el catálogo. Sólo se agregan las filas
  tildadas con cantidad entera válida; no se duplican productos ya cargados y se
  respeta el máximo de 100. Si un producto viene en varios renglones (la droguería
  puede partirlo, con el mismo código), las cantidades se suman en una sola línea
  del pedido; vincularlo o crearlo una vez alcanza a todos sus renglones (05/11/2026).
  Se conserva el costo del primer renglón que lo informa. El costo del Excel es una sugerencia editable. Importar
  no guarda la compra: el pedido se revisa y se guarda como siempre. Lógica en
  `apps/web/src/lib/purchase-excel.ts`, interfaz en `purchase-excel-import.tsx`.
- Factura PDF (02/11/2026): pensada para la compra directa, cuando la mercadería
  llega con la factura. Cada droguería ordena distinto las columnas (Monroe:
  código, descripción, cantidad…; Del Sud: cantidad, descripción, código…), así
  que no se leen por posición: se arman los renglones con el texto del PDF y se
  toman los que tienen código de barras y tres números que cumplen
  cantidad × precio unitario = importe (con hasta un centavo por unidad de
  redondeo). Ese precio unitario neto es el costo sugerido; precio público,
  descuentos y márgenes se ignoran. Un renglón con código y precios que no
  cierran la cuenta queda sin cantidad para revisarlo. Si una página no tiene
  texto (PDF escaneado) se usa el mismo OCR local de Distribución. La revisión
  es la misma del Excel, sin elegir columnas, y muestra el total de unidades
  para compararlo con la factura. La factura no trae lote ni vencimiento: se
  cargan en la recepción. Lógica en `apps/web/src/lib/purchase-invoice-pdf.ts`,
  lectura en `read-purchase-invoice-pdf.ts`.
- Crear producto desde la revisión (02/11/2026): un renglón del Excel o de la
  factura sin producto en el catálogo ofrece Crear producto. Abre el mismo
  editor de Nuevo producto encima de la revisión, como si se escaneara el
  código: busca la referencia en el padrón y, si el código ya es de otro
  producto, abre ése. El nombre de la factura queda precargado hasta que llegue
  el del padrón. Al guardar, el renglón queda vinculado y tildado; si se cierra
  sin guardar, queda como estaba.
- El editor amplio acepta hasta 100 productos distintos. Enter sobre un código agrega el producto y devuelve el foco al buscador; repetirlo enfoca su cantidad, no duplica filas. Costos y cantidades se editan antes de guardar. Guardar pedido no acredita stock.
- Compra directa prepara productos y después cantidades/lotes. Continuar no escribe en la base; confirmar crea compra y primera recepción juntas, atómicamente.
- Recibir permite cantidades parciales, varios artículos y varios lotes con una confirmación global. La opción "máx" dentro del campo completa la cantidad del lote con lo pendiente, descontando lo cargado en los otros lotes del producto (05/11/2026). Las filas vacías/cero quedan pendientes. Se muestran pedido, recibido, pendiente y resumen de esta entrega. El escáner identifica el producto: no inventa lote ni vencimiento. El número de lote sugiere los lotes del producto en la sucursal, incluidos los agotados, y acepta uno nuevo. Con un lote existente el vencimiento se completa y queda fijo, porque la API rechaza otra fecha; para cambiarlo se corrige el lote en Inventario (05/11/2026).
- El detalle muestra cantidades originales, recibidas, pendientes, no entregadas y costos; cada nueva recepción conserva fecha, usuario, observaciones y lotes. El saldo puede cerrarse con motivo sin revertir stock recibido. No hay eliminación de documentos confirmados.
- Inventario conserva Recibir, Ajustar y Devolver. Al elegir un producto con compras pendientes ofrece abrir la compra correspondiente; no acredita nuevamente lo recibido ni convierte entradas manuales en compras.
- El borrador se conserva por usuario/organización/sucursal en sessionStorage de la pestaña. Se pide confirmación antes de descartarlo. No es un borrador compartido en servidor: cerrar la pestaña o borrar datos del navegador puede perder datos todavía no enviados.
- Antes de enviar se conserva el cuerpo y la clave de operación. Ante respuesta incierta queda bloqueado para reintentar exactamente la misma solicitud, incluso tras recargar. Errores de validación permiten corregir; conflictos actualizan el saldo o verifican que la compra no fue creada antes de habilitar edición.

## Persistencia y compatibilidad

Migración aditiva: `apps/api/prisma/migrations/20261019000000_purchase_receipts_v2/migration.sql`.

Agrega metadata de compra, cantidad no entregada y tablas PurchaseReceipt/PurchaseReceiptItem. El saldo disponible es pedido menos recibido menos no entregado. El cierre se representa con CANCELLED + closedAt/reason y se muestra como Saldo cerrado; no cambia el enum histórico.

El servicio existente PurchasesService sigue siendo el punto de acreditación de ProductLot y de InventoryMovement. Cada entrega bloquea la compra y valida el saldo dentro de la transacción; compra directa, líneas, lotes, movimientos y auditoría se confirman juntos. Las claves de operación son únicas por organización/sucursal y su hash impide reutilizarlas con otro contenido. Bloqueos adicionales ordenados serializan los lotes entre compras concurrentes; los lotes existentes conservan costo y vencimiento, rechazando un vencimiento incompatible. El costo de cada nueva recepción queda registrado por separado.

Se conservan POST purchases y POST purchases/:id/receipts. Clientes antiguos sin clave de operación siguen siendo compatibles, pero no tienen garantía de deduplicación entre reenvíos independientes. La interfaz nueva siempre envía una clave. Los endpoints nuevos son GET purchases/:id, POST purchases/direct, POST purchases/:id/receipts/batch y POST purchases/:id/close-balance. No se cambian ventas, caja, cuenta corriente, listas de precios ni stock por crear un pedido.

## Despliegue y respaldo

1. Antes de migrar, respaldar y ensayar restauración en una base separada. Para la instalación local se agregó `scripts/backup-local-purchases.ps1`, restringido a localhost/gestion_dev. El respaldo se guarda fuera del repositorio, en `%LOCALAPPDATA%/FarmaciaJuncos/RespaldosLocales`, con ACL privada.
2. En esta intervención se generó `compras-v2-20261019-160238.dump` antes de aplicar la migración local. Se verificó su índice con pg_restore --list; no se ensayó su restauración completa.
3. Generar Prisma, ejecutar prisma migrate deploy con el entorno del destino, desplegar API y web compatibles y comprobar salud. La migración ya fue aplicada sólo a la base local, sin reinsertar movimientos históricos. No se desplegó a producción.
4. No editar ni revertir destructivamente la migración aplicada. Si falla la versión, suspender nuevas recepciones y corregir hacia adelante. Una versión anterior no conoce saldos cerrados; no debe habilitarse para escritura indiscriminadamente. Restaurar un respaldo sólo mediante un procedimiento coordinado que preserve las operaciones posteriores; no usarlo como rollback automático.

## Pruebas y alcance

`apps/api/test/purchase-receipts.integration.spec.ts` usa un esquema PostgreSQL aleatorio y datos sintéticos, ejecuta todas las migraciones y elimina únicamente ese esquema de prueba. Cubre 50 líneas sin stock, regresión +200, entregas 100/60/40, multilote, validación, rollback de un conflicto tardío, doble envío, dos conexiones concurrentes, cierre de saldo, compra directa/reintento, permisos/sucursal, costos y precios intactos, lotes vencidos e historial legado.

`apps/web/src/lib/purchases.test.ts` cubre validaciones, centavos, límite conjunto de lotes y saldo cerrado. Prueba de navegador con fetch simulado: 50 códigos, continuación sin POST, lote/vencimiento sin autocompletar, doble clic, interrupción, recarga y repetición idéntica. Las capturas locales están en `.cache/purchase-editor-1366.png` y `.cache/purchase-receive-1366.png`. No se hicieron compras de prueba sobre existencias comerciales reales ni se probó un lector físico: se simularon sus teclas.

El historial anterior puede no contener nombre humano o vencimiento original por movimiento; se muestran los datos disponibles, sin fabricar cabeceras retrospectivas. Tampoco se agregó una política nueva de vencimiento obligatorio por tipo de producto.

## Guía breve para el empleado

1. **Pedido:** Compras → Nueva compra → proveedor → agregar productos por nombre/código → completar cantidades y costos → Guardar pedido.
   Si la droguería mandó un Excel: Importar archivo → revisar las filas, vincular las que no encontró → Agregar al pedido → revisar y Guardar pedido.
2. **Entrega parcial:** abrir la compra → Recibir mercadería → completar sólo lo recibido, con sus lotes y vencimientos → revisar el resumen → Confirmar recepción.
3. **Entrega posterior:** abrir la misma compra pendiente y repetir; el saldo se actualiza por artículo.
4. **Llegó sin pedido previo:** Nueva compra → Compra directa → cargar productos → Continuar a recepción → confirmar lo que llegó.
   Si vino con la factura PDF: Importar archivo → elegir el PDF → controlar las unidades con la factura y vincular lo que no encontró → Agregar al pedido → Continuar a recepción → lotes y vencimientos → confirmar.
5. **No llegará el resto:** detalle → cerrar saldo → escribir motivo → confirmar. Lo ya recibido permanece en inventario.
6. **Se cortó la conexión:** volver a Continuar borrador y Reintentar misma solicitud; no crear otra compra para el mismo envío incierto.

## Futuro, no implementado automáticamente

Importación de formatos distintos de `.xlsx` y PDF (por ejemplo `.xls`, CSV o fotos sueltas), envío de pedidos, trazabilidad oficial ANMAT/serialización, pagos complejos de proveedores y cuarentena sofisticada quedan fuera de esta ampliación.

## Verificación final — 20/10/2026

- Prettier aplicado y comprobado sobre los archivos modificados (sin reformatear archivos ajenos).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`: correctos. Tests: 439 API, 517 web y 18 del circuito de impresión. Build conserva advertencia de chunks mayores a 500 KB; no impide compilar.
- `prisma migrate status`: 54 migraciones, base local actualizada. Salud API/base: ok.
- Prueba visual y funcional en Edge headless a 1366×768 con datos simulados: correcta; archivos temporales de la web retirados al terminar. Las capturas se conservan en `.cache`.
- No verificado: restauración integral del respaldo, despliegue productivo ni lector de códigos físico. No se cargaron compras sintéticas sobre existencias comerciales.
