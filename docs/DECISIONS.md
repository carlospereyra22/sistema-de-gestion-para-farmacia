# Decisions

## DECIDED

- 11/11/2026 (SISTEMA-90): al cambiar un filtro, el Resumen de Reportes conserva lo que se
  ve (atenuado, con "Actualizando…") hasta que llega la respuesta, en vez de volver al
  esqueleto; así números y gráficos pasan de lo anterior a lo nuevo. Reemplaza lo de
  SISTEMA-11 de mostrar el esqueleto con filtros distintos. Con error o de otra organización
  no se muestra lo viejo. Los KPI cuentan en 2,3 s con `easeOutPower` y cada widget anima su
  entrada al verse por primera vez (`docs/REPORTS_PLAN.md`). Sin librerías nuevas.
- 11/11/2026 (SISTEMA-87): Reportes tiene una entrada animada (pedido del usuario): los
  números de los KPI suben desde 0, las tarjetas y los paneles aparecen de a uno, la línea
  de evolución se dibuja y las barras crecen. Sólo la primera vez que se abre Reportes en la
  sesión del navegador (`sessionStorage`), para que no se repita en cada entrada; después
  todo aparece directo y al cambiar un filtro los gráficos hacen una transición corta.
  Nunca anima sin conexión, con la copia guardada ni con "reducir movimiento"
  (`lib/animacion-reportes.ts`). Sin librerías nuevas: CSS, `requestAnimationFrame` y la
  animación de ECharts.

- 11/11/2026 (SISTEMA-86): Inicio funciona sin conexión. A diferencia de Reportes (copia
  del servidor), Inicio muestra "lo de hoy en esta sucursal": las ventas parten de la copia
  y suman las de la PC sin enviar, y los demás KPI se calculan con las copias de la PC con el
  mismo criterio que el servidor (`lib/inicio-sin-conexion.ts`). El buscador de medicamentos,
  sin conexión, consulta la base de medicamentos de la PC en lugar de AlfaBeta (pedido del
  usuario). Se hizo sobre el rediseño de Inicio de SISTEMA-85.

- 11/11/2026 (SISTEMA-81): Asignar cobros pendientes de caja deja de ser "sólo con conexión"
  (decisión del 09/11/2026): asignar caja, incorporar a una sesión y quitar la caja son
  operaciones de caja sin conexión (`cash/offline`, tipos `COBRO_DESTINO`,
  `COBRO_INCORPORAR` y `COBRO_QUITAR`). Ante un choque no se mueve plata: queda aviso
  (`COBRO_YA_ASIGNADO`, o `CAJA_CERRADA` si la sesión ya se cerró). La incorporación con y
  sin conexión comparte el mismo código (`incorporarCobro`). También: la creación de
  productos en tanda desde una factura de Compras funciona sin conexión, y una compra con un
  producto creado sin conexión espera en la PC detrás de su alta. Una escritura automática
  que la pantalla hace al abrirse (preparar las categorías por defecto en Productos) no se
  intenta sin conexión: su error aparecía como aviso en otras pantallas.

- 10/11/2026 (SISTEMA-80): Categorías y laboratorios y listas de precios funcionan sin
  conexión con el mismo circuito que productos (`catalog/offline`, nuevos tipos de
  operación); la regla de choques es la de productos: el cambio más reciente gana, dato por
  dato y precio por precio. La vista previa de un ajuste de precios sin conexión la calcula
  la PC con la misma fórmula que el servidor. Reportes deja de ser "sólo con conexión"
  (decisión del 09/11/2026) pero no se calcula en la PC: los reportes suman lo de todas las
  PCs y sucursales, y recalcularlos en el navegador duplicaría la lógica del servidor con
  datos incompletos. Sin conexión se muestra la copia guardada del servidor con la hora de
  los datos (decisión del usuario); la PC guarda cada 15 minutos los períodos habituales.

- 10/11/2026 (SISTEMA-79): Productos e inventario funcionan sin conexión con el mismo
  circuito que los demás módulos: la operación queda en la bandeja de la PC, firmada, y se
  registra al volver con `OfflineOperation` (rutas `catalog/offline` e `inventory/offline`
  de la sucursal, más `/firmada`). Reemplaza la decisión del 09/11/2026 que los dejaba sólo
  con conexión. Reglas de los choques en `BUSINESS_RULES.md` (decisiones del usuario). Para
  saber si otra PC cambió el mismo dato de un producto, la edición con conexión pasa a dejar
  en la auditoría (`PRODUCT_UPDATED`) qué datos cambió; antes no quedaba registro. Un lote
  creado sin conexión no tiene id: las operaciones lo nombran por producto y número, que es
  único en la sucursal. Los métodos del catálogo y del inventario se separaron en
  validación y trabajo dentro de la transacción (`crearEnTx`, `editarEnTx`, `recibirEnTx`,
  `ajustarEnTx`, `devolverEnTx`) para registrar la operación sin conexión en la misma
  transacción. Las listas de precios, la pantalla Categorías y laboratorios y la búsqueda de
  datos en internet siguen necesitando conexión.

- 10/11/2026 (SISTEMA-78): Costos de inventario por partes, como el stock
  (`GET inventory/costs/versiones` y `costs/partes`): una venta no cambia ningún costo y no
  se vuelve a bajar nada. El estado de cuenta se pide sólo para lo que se imprime
  (`customerId`, `desde`; el saldo anterior lo calcula la base) y ya no se precarga entero
  cada 10 minutos (11,5 MB por PC). Sin conexión se arma con los movimientos guardados de
  cada cliente: alcanza con los clientes con saldo y los que se abrieron en esa PC
  (decisión del usuario); un cliente saldado que nunca se abrió no aparece.

- 10/11/2026 (SISTEMA-77): El stock de la sucursal se sincroniza por partes, como el
  catálogo (`GET inventory/stock/versiones` y `inventory/stock/partes`): la parte de un lote
  es la de su producto. La versión resume también las cargas y devoluciones por proveedor
  de cada lote, los proveedores y si se ven costos, porque cambian lo que se devuelve. La
  copia por partes de la web es un módulo común (`lib/copia-por-partes.ts`) para catálogo y
  stock. Lo que depende del día (vencido, por vencer) no se guarda: se calcula al armar.
  Prueba de carga con 10 PCs y 60.000 productos: de 16 s a 1 s por actualización y de
  2.829 MB a 4 MB en 5 vueltas (ver `RENDIMIENTO.md`).

- 10/11/2026 (SISTEMA-76): El worker del lector de PDF (facturas de Compras y pedidos de
  Distribución) se crea desde una copia en memoria (blob) de su código, cargado como parte
  de la app con `?raw`, y no desde su dirección: pdf.js lo pide por red cada vez que lee un
  PDF y sin conexión fallaba si el navegador no lo tenía guardado. Se descartó pedirlo con
  `fetch` (en desarrollo Vite lo devuelve modificado y no anda como blob) y correr pdf.js en
  la pestaña sin worker (traba la pantalla con PDF grandes).

- 10/11/2026 (SISTEMA-75): Cuentas corrientes con saldos calculados en el servidor
  (decisión del usuario). `GET customer-accounts` devuelve cada cliente con su saldo, la
  cantidad de movimientos y el último cobro (sin contar anulaciones), sumados en
  PostgreSQL, y ya no sus movimientos: con 3.000 clientes de 20 movimientos bajó de 27 MB y
  1,4 s a 1 MB y 0,14 s. Los movimientos de un cliente se piden al abrirlo
  (`GET customer-accounts/:customerId/movements`). Para no contar dos veces lo que la PC
  envió y el servidor ya registró, la web pide los movimientos sólo de los clientes con
  operaciones pendientes en la bandeja. La precarga guarda los movimientos de los clientes
  con saldo (los mismos que ya guardaban sus artículos) y sólo los vuelve a pedir si
  cambiaron el saldo o la cantidad; los movimientos nunca se borran, así que alcanza con
  eso.

- 10/11/2026 (SISTEMA-74): Rendimiento con catálogos e historiales grandes (60.000
  productos o más). El catálogo se sincroniza por partes: 256 partes por los dos primeros
  caracteres del id, cada una con una versión que resume su contenido
  (`GET catalog/products/versiones` y `catalog/products/partes`); la PC las guarda en
  IndexedDB y sólo pide las que cambiaron. Se descartó invalidar todo el catálogo con una
  versión única (la corrida de precios y cada edición forzaban bajar 46 MB) y llevar
  historial de cambios por producto (las eliminaciones y los cambios de códigos no dejan
  rastro). Las relaciones de Prisma con claves de varias columnas no se usan para listados
  grandes: arman una condición por fila que PostgreSQL rechaza con unos miles. Compras e
  historial de Inventario traen por defecto los últimos 90 días (Compras, además, los
  pedidos abiertos); para lo anterior se eligen fechas (decisión del usuario). Sin conexión
  conocida la web no sale a la red y responde con la copia; con conexión cada pedido tiene
  un tiempo máximo de 30 s. nginx comprime el JSON menos en `/auth/`. Detalle y mediciones
  en `RENDIMIENTO.md`.

- 10/11/2026 (SISTEMA-73): Proveedores y Cuentas por pagar funcionan sin conexión, con el
  mismo circuito que los demás módulos: la operación queda en la bandeja de la PC, firmada,
  y se registra al volver con `OfflineOperation` (rutas `suppliers/offline` y
  `supplier-payables/offline`, más `/firmada`). Reemplaza la decisión del 09/11/2026 que las
  dejaba sólo con conexión (Reportes sigue sólo con conexión). Para ver Cuentas por pagar sin
  conexión la PC guarda una copia (`GET supplier-payables/base-local`: todas las deudas con
  saldo y las últimas 100 saldadas) y arma el listado con el mismo cálculo y los mismos
  filtros que el servidor; con conexión y sin nada pendiente se sigue usando el listado del
  servidor. Proveedor, deuda y pago creados sin conexión usan la clave de la PC como id, y el
  servidor acepta nombrar una deuda por su clave (`operationId`), así también se paga la
  deuda de una recepción sin enviar. Los rechazos definitivos de estas rutas sin conexión
  responden 422 y no 404/409, porque esos códigos significan "queda para su dueño" en la
  bandeja y frenarían el envío del resto de la sucursal.

- 07/11/2026 (SISTEMA-58, arreglos de la prueba): El menú muestra solo las pantallas cuyo
  permiso de lectura tiene el rol, con el mismo permiso que pide la API al cargarlas
  (`lib/workspace-permissions.ts`). Categorías y Listas de precios piden administrar el
  catálogo, y Transferencias, administrar inventario. Una pantalla sin permiso pedida por la
  dirección muestra Inicio. La API sigue siendo la autoridad: esto evita ofrecer lo que después
  se rechaza. Al iniciar sesión con usuario y clave se entra siempre a Inicio; recargar la
  página conserva la pantalla. Los costos de los productos tienen permiso propio
  (`COST_READ`), controlado en la API: la consulta de stock no manda el costo y la de costos
  se rechaza. Antes los veía cualquiera que consultaba stock; la migración se lo da a esos
  roles, menos al Empleado, para que nadie pierda lo que veía. Las ganancias ya tenían el suyo
  (`REPORT_PROFIT_READ`) y solo aparecen en Reportes.

- 07/11/2026 (SISTEMA-58): El corte se aplica con un interceptor global y no con un guard por
  controller, para que ninguna ruta nueva quede afuera por olvido: lo exceptuado se marca, y un
  test fija la lista completa. Ante cualquier duda deja pasar, porque cortar a quien pagó es
  peor que dejar pasar a quien debe. Responde 402 con código, que la web distingue de un error
  común. El aviso va en el encabezado y no en una franja arriba del sistema: la franja empujaba
  el punto de venta y escondía el botón Cobrar. Al terminar una prórroga, el atraso se cuenta
  desde la deuda real y no desde la prórroga, a pedido del usuario: si no, cada prórroga
  regalaba otros 10 días de gracia y corría todo el corte.

- 07/11/2026 (SISTEMA-57): El cupo se valida dentro de la transacción con un bloqueo sobre
  la suscripción, también desde el panel, para que una ampliación no quede sin cobrar. El
  código de sucursal deja de pedirse: se genera del nombre y la API sigue aceptándolo
  porque la web se publica a mano y puede quedar atrás. El catálogo externo se habilita por
  una lista separada por comas en la variable que ya existía: el valor actual de producción
  sigue siendo válido y no hace falta migrar nada. Sumar una farmacia es un cambio de
  configuración en el servidor, a propósito: hoy el catálogo es de Juncos y darlo a otra
  farmacia es una decisión comercial, no algo automático del alta.

- 07/11/2026 (SISTEMA-56): Las suscripciones se cobran mes adelantado. Los pagos no se
  imputan en una tabla: una función pura los reparte del cargo más viejo al más nuevo
  cada vez que hace falta, porque así anular un pago no tiene nada que deshacer y
  `paidThrough` no puede desincronizarse. Esto reemplaza a la tabla de imputaciones
  prevista en el plan. El cálculo corre en la misma transacción que el pago y también
  genera lo que falte, para que un pago reactive al instante y no dependa del proceso
  programado. Una farmacia bloqueada que salda su deuda recibe condonados los meses que
  pasó sin servicio, porque si no quedaría bloqueada sin nada que pagar.

- 07/11/2026 (SISTEMA-55): El estado comercial de una farmacia se calcula por fechas y no
  se guarda, para que el corte no dependa de un proceso programado y un pago reactive al
  instante. El día comercial cambia a las 06:00 de Argentina. El plan nace sin importes:
  los precios se cargan desde el panel y no quedan escritos en el repositorio.

- 06/11/2026 (SISTEMA-54): Recibir mercadería y pagar a proveedores tienen permisos
  propios (`PURCHASE_RECEIVE`, `PAYABLE_PAY`). Antes venían junto con comprar y con
  cargar facturas, así que no se podía delegar una tarea sin dar la otra. La migración
  se los da a quienes ya tenían el permiso anterior, para que nadie pierda acceso.
  Quien solo recibe no ve costos: se quitan en la API, no en la pantalla. Las farmacias
  nuevas arrancan con un rol `EMPLEADO` de mostrador porque `USER` no tiene permisos.
  Listar las sucursales propias y leer el encabezado del ticket ya no exigen
  `ORGANIZATION_READ`: toda la web depende de eso y sin ello un rol de mostrador no
  podía entrar.

- 06/11/2026 (SISTEMA-50): El superusuario de plataforma es una tabla propia
  (`PlatformAdmin`), no un `Permission`, porque `roles.service.ts` acepta cualquier
  código y una farmacia podría asignárselo. Se otorga solo por comando en el servidor,
  sin endpoint. Las rutas `/platform` responden igual que una ruta inexistente a
  cualquiera que no sea administrador, también sin sesión. El segundo factor es TOTP
  con `node:crypto`, sin dependencia nueva, y el bloqueo por intentos va en el paso del
  código: en la clave, cualquiera con el correo podría dejarnos afuera del panel.

- 06/11/2026 (SISTEMA-49): El cambio obligatorio de contraseña se controla en
  `JwtAccessGuard` y no solo en la web: al consultar la sesión en cada pedido ya tiene
  el dato, y cubre todas las rutas sin marcar cada controller. Solo las rutas con
  `@AllowPendingPasswordChange` pasan. Restablecer la clave de otro usuario desde
  Administración activa el cambio obligatorio, porque quien la restablece la conoce.

- 06/11/2026 (SISTEMA-48): El rol OWNER cuenta como administrador de su farmacia,
  igual que ADMIN, para archivar cierres de caja y cambiar el estado de productos por
  sucursal. Antes esos puntos exigían ADMIN y el dueño creado por el alta, que solo
  recibe OWNER, quedaba sin esas capacidades. Se corrige en el chequeo y no asignando
  ADMIN en el alta, porque eso no arreglaría a los dueños que ya existen. El panel de
  plataforma y el cobro a farmacias se planifican en `docs/PLATFORM.md`.

- 06/11/2026 (SISTEMA-42): El servicio se cobra por usuario activo y por sucursal.
  La caja no es unidad de cobro. Para que compartir un usuario no reemplace pagar
  otro, cada usuario tiene una sola caja abierta por organización. No se vincula un
  usuario fijo a cada caja: complicaría los cambios de turno y no agrega control.
  La regla no impide usar un mismo login en varias PC sobre una caja; eso, los
  planes y sus topes siguen en la epic Planes, suscripcion y cobro.

- 04/11/2026 (SISTEMA-26): Los medicamentos pasan a una base propia dentro de la
  base principal, no en `catalogo_juncos_external`, porque la actualiza la corrida
  de las 09:00 y 17:00 y el rol de esa base es de sólo lectura. La corrida toma de
  ahí los precios y lee Remedios y AlfaBeta por link guardado, sin buscar por
  nombre. Solo entran productos con precio y link; el resto se revisa en un Excel.
  Los dados de baja del padrón siguen publicados con precio en la web oficial:
  toman ese precio y quedan marcados.
  Ver MEDICINE_CATALOG.md.

- 02/11/2026 (SISTEMA-22): Las tablas del sistema pasan a un estilo único
  (`apps/web/src/data-table.tsx`): 14 px dato principal, 12 px encabezados y
  secundarios, números alineados a la derecha, estado con punto y texto y
  acciones con botones de ícono. Productos es la primera; el resto se migra en
  tareas siguientes. En Productos se quitan los indicadores Total y Activos (no
  indicaban nada que hacer) y quedan Sin stock, Stock bajo, Por vencer y
  Vencidos, que filtran la tabla. Los filtros adicionales dejan de estar en una
  ventana aparte. Estado y Próx. venc. siguen el orden de lotes acordado (por
  vencer, normales, vencidos) y respetan los filtros de stock y vencimiento.
  Sin cambios de API ni de base. Ver PRODUCTS.md.

- 02/11/2026 (SISTEMA-21): Las fuentes de medicamentos se consultan una vez
  para todo el SaaS y se guardan en una copia local compartida
  (`MedicineReferenceSnapshot`, sin organizationId: información pública) en la
  base comercial, no en la base separada del catálogo externo, porque la
  actualiza la propia API y la usan precios, búsqueda y escaneo. La corrida
  sigue a las 09:00 y 17:00 de Argentina (horario elegido por el negocio).
  Sigue dentro del monolito (sin worker ni servicio nuevo); la exclusión entre
  instancias es un índice único parcial en PostgreSQL. Sin umbral de salto de
  precio por ahora. Resincronizar, deshacer y pausar se hacen con un comando
  de servidor hasta que exista un rol de administrador de plataforma. Ver
  PRODUCTS.md.

- 02/11/2026 (SISTEMA-20): El código de barras es único por organización, no en
  toda la base: dos farmacias (organizaciones) pueden cargar el mismo EAN y las
  sucursales de una farmacia comparten el catálogo. `ProductBarcode` lleva
  `organizationId` con FK compuesta `(productId, organizationId)` e índice único
  `(organizationId, code)`. Se suma el tipo de código: `PACKAGE` (envase),
  `INTERNAL` (SG de etiquetas) y `EQUIVALENT` (EAN de un envase importado del
  mismo medicamento, asociado al producto nacional). Un GTIN cuenta igual con o
  sin ceros a la izquierda al buscar duplicados. Se descartó un catálogo de
  códigos compartido entre organizaciones: cada farmacia tiene su propio
  producto (precio, nombre, stock) y sus propias equivalencias. Ver PRODUCTS.md.

- 01/11/2026 (SISTEMA-17): Comprobante A4 por farmacia, aparte del ticket térmico
  de 80 mm (que no cambia). Una plantilla única que cada organización personaliza
  con logo a color (JPEG ≤ 60 KB), color de acento y pie libre; usa los datos del
  encabezado del ticket y, si es factura, los fiscales (CAE, QR). Se imprime desde
  el navegador (impresora o «Guardar como PDF»). El formato predeterminado
  (TICKET/A4) se define por organización y cada sucursal puede usar uno propio;
  sin configurar queda TICKET. El A4 no calcula importes y muestra sólo la forma
  de pago (sin recibido ni vuelto). Lectura con ORGANIZATION_READ o SALE_READ,
  cambios con ORGANIZATION_MANAGE y auditoría. Ver THERMAL_TICKETS.md.

- 01/11/2026 (SISTEMA-16): Rediseño de Ventas: catálogo + Venta actual
  protagonista en dos columnas iguales y cobro en una ventana. Se elimina la
  columna fija de cobro. El descuento general admite % o $, pero siempre se envía
  como importe en centavos. Los cálculos de la ventana (vuelto, montos rápidos,
  formato del importe) son vista previa y la API sigue validando. En Venta
  confirmada, imprimir es la acción principal; la vista previa del ticket es
  sólo visual y a pedido, y la impresión sigue por envío directo RAW. Sin cambios
  de API, Prisma ni contratos. Ver WORKSPACE.md y `docs/ventas-rediseno/`.

- 01/11/2026 (SISTEMA-10): un solo repositorio y una sola rama `main`, sin ramas
  por ambiente. Entre ambientes viaja un commit de `main` identificado con un tag
  `vX.Y.Z`; produccion se publica desde el tag ya probado en test. El ambiente hoy
  llamado "preprod" funciona como test; renombrarlo y agregar una preproduccion
  real quedan pendientes. Ver la skill `publicar-ambientes`.

- 01/11/2026: preproducción se instala en base, servicio, credenciales y sitio
  Netlify separados; no se clona producción ni se mezcla su información comercial.
  Validar una versión allí no publica ni habilita emisión fiscal productiva. Ver
  PREPRODUCCION.md.

- Login y recuperación de acceso (01/11/2026, SISTEMA-7): nueva pantalla de ingreso (`login-screen.tsx`) con panel de producto y tarjeta de acceso, paleta verde azulado intermedia entre el teal del sistema y el azul del logo. Email y contraseña, sin selector de sucursal (se elige después de entrar). «¿La olvidaste?» explica pedir una nueva al administrador, que puede restablecerla (ver BUSINESS_RULES). La recuperación por email queda para la epic Cuentas y seguridad (requiere servicio de correo). «Pedí una demo» y «Volver al sitio» usan `VITE_LANDING_URL`; sin esa variable en producción no se muestran. Nombre provisorio Farmatec.
- Reportes interactivos (31/10/2026, SISTEMA-2): las definiciones de cada metrica viven en `docs/REPORTS_PLAN.md` y los tipos en `packages/contracts/src/reports.ts`; todas las pestanas y exportaciones las comparten. Importes como centavos en string. Ventas por medio de pago restan el vuelto al efectivo (la pantalla anterior no lo hacia). Devoluciones se restan en la fecha en que ocurren. Costo y margen son estimados por costo de lote. "Todas las sucursales" se ofrece solo con 2 o mas sucursales autorizadas y se calcula en cada consulta. Umbrales por defecto editables: stock bajo 5, sin movimiento 30 dias, vencimientos 90 dias. Permisos nuevos `REPORT_PROFIT_READ` y `REPORT_EXPORT`.

- La opción «Descartar venta» del aviso de venta pendiente descarta directamente el borrador, sin segunda confirmación. No anula ni elimina ventas registradas; reemplaza la confirmación adicional acordada inicialmente.

- 20/09/2026: la venta pendiente se conserva en memoria al navegar entre apartados o Historial dentro de la misma sesión/sucursal. Al volver al punto de venta se ofrece continuar o descartar con confirmación. No se crea venta ni se reserva stock al suspender; el backend sigue validando al confirmar. Se advierte antes de recargar/cerrar pestaña, cambiar de sucursal o cerrar sesión; no hay recuperación persistente después de recargar. La organización/sucursal delimita el estado para impedir mezclar ventas.

- 20/09/2026: se incorpora Publicar Produccion.cmd como despliegue asistido. Usa una copia aislada, checks locales, release separado en Linux, verificación de migraciones históricas, respaldo con restauración de prueba y health antes de preparar SUBIR-A-NETLIFY. Reutiliza secretos y servicio existentes; Netlify sigue manual. No ejecuta seed/reset ni rollback automático de datos. Ver PUBLICAR_PRODUCCION.md. Crear/probar el lanzador no implica desplegarlo.

- 20/09/2026: se amplía la densidad seleccionable a 1–8, manteniendo 4 por defecto, según el rango mostrado por el controlador Xprinter del usuario. API y agente 1.0.4 validan este rango. La equivalencia física de cada nivel con el controlador sigue pendiente de prueba; no se extiende la compatibilidad a otros modelos.

- 20/09/2026: Tickets y comprobantes permite ajustar densidad 1–4 del perfil Xprinter XP-80 (4 por defecto). Se guarda por organización en ticketHeader, validada por API y agente, usando permisos/auditoría existentes; ventas y cobros usan el valor al cargar el documento. No modifica el diseño ni garantiza compatibilidad con otras impresoras. Requiere agente 1.0.3-pilot o posterior; actualizado en esta PC, pendiente prueba física y producción.

- 20/09/2026 (posterior a la prueba en papel): se rechazó la adaptación HTML por calidad. Se restaura RAW y se prueba un agente local instalable desde la web en cada PC. El piloto tiene selector de impresora, runtime incluido e inicio por usuario con WScript, sin consola permanente; V21 es el perfil físico y no significa Cloud V24 instalado. Ver LOCAL_PRINT_AGENT.md. No se modificó producción.

- 20/09/2026: el flujo solicitado es impresora/controlador en cada PC e impresión desde el navegador, sin agente ni Print Box. El botón compartido abre directamente el diálogo del navegador. Se adapta el formato V24 con sus bitmaps originales y medidas físicas, preservando datos reales. La equivalencia física queda pendiente de comparar papel; no se promete fuente ROM, densidad RAW ni corte controlados por CSS. Ver BROWSER_PRINT_V24.md. No habilitar Cloud V24 ni publicar el paquete anterior como si incluyera este cambio.

- Organización tiene un espacio independiente (`?pagina=organizacion`) con Datos generales, Sucursales y Tickets y comprobantes. Ya no comparte pestañas con Usuarios/Roles. Los enlaces anteriores a Administración/branches siguen abriendo Sucursales. No se agrega Configuración general ni controles para modificar el formato físico del ticket.
- Datos generales y Tickets editan la misma fuente persistida de identidad/encabezado (nombre comercial, logo, dirección, ciudad, provincia, CUIT y teléfono); no hay copias ni datos de ejemplo. El editor conserva cambios al alternar las secciones. Los nombres de atención usan la edición existente por usuario/organización.
- Sucursales incorpora dirección, ciudad, provincia y teléfono opcionales. Crear, editar, desactivar, reactivar y eliminar requieren ORGANIZATION_MANAGE y registran auditoría. La eliminación es lógica (`deletedAt`) y se admite solo sin registros comerciales/cajas vinculados; las sucursales con historial pueden desactivarse y reactivarse. No se elimina historial ni se reutiliza su código. Se conserva al menos una sucursal activa y se deben cerrar sus cajas antes de desactivarla. El selector operativo muestra solo activas y conserva la selección mientras siga válida.
- Despliegue: ejecutar las migraciones versionadas antes de iniciar la nueva API y regenerar Prisma al construir. `20260920010000_branch_details` agrega columnas con valores vacíos para sucursales existentes. Aplicada únicamente en gestion_dev local el 20/09/2026, junto con la migración pendiente de la cola V24 (solo esquema; la cola continúa deshabilitada). No se desplegó al VPS.

- El encabezado presenta un menú de cuenta con iniciales, nombre configurado (o nombre del comercio) y sucursal activa. El correo y Cerrar sesión quedan dentro del desplegable. Usa los datos existentes de auth/me; no modifica autenticación ni permisos. Escape y clic exterior cierran el menú; los atajos de búsqueda de Ventas se suspenden mientras está abierto.

- Productos muestra 10 resultados por página, usando el mismo componente visual de paginación que el historial de ventas. La búsqueda y los filtros se aplican al catálogo cargado completo antes de paginar; cambian a la primera página y se ajusta la página al reducirse los resultados. No cambia la API ni las operaciones del catálogo.

- Los cobros de cuenta corriente muestran un diálogo de confirmación con el diseño de ventas y las acciones Cerrar / Imprimir ticket. El ticket identifica el recibo, pero omite los códigos internos de venta debajo de los artículos; esos vínculos se conservan en el sistema y en auditoría. La reimpresión sigue disponible en Historial.

- Node.js 24, TypeScript strict, pnpm workspaces, React/Vite and NestJS REST.
- PostgreSQL plus Prisma remains the data platform.
- The initial operational model is Organization to Branch with UUIDs.
- The application begins as a modular monolith.
- Fase 1 uses email and password authentication with Argon2id hashes, a 15-minute access JWT and a revocable seven-day refresh session in an HttpOnly cookie.
- Users are global identities. Membership, roles and branch assignments are organization-scoped through `UserOrganization`, `UserOrganizationRole` and `UserBranch`.
- The initial roles are `OWNER`, `ADMIN` and `USER`. Only the first two receive the initial user and role administration permissions.
- Products do not require an internal code initially; barcodes remain an independent, multi-value relation.
- Catalog prices use Argentine pesos stored as integer minor units. The first release keeps a current price per product and price list; dated price validity is deferred.
- `Sistema_Gestion_Farmacia_Especificacion_Funcional_v1.pdf` is the functional reference for the MVP. Its priorities are operational integrity, traceability by lot and branch, and auditable commercial documents; fiscal, prescription and external integrations remain post-MVP.
- La V2 funcional/visual y su especificación técnica externa (`Sistema_Gestion_Farmacia_Diseno_Funcional_Visual_V2.pdf` y `Sistema_Gestion_Farmacia_Implementacion_Tecnica_V2.md`) guían la evolución incremental. Cuando entren en conflicto con `BUSINESS_RULES.md`, se registra la discrepancia antes de alterar una regla comercial.
- La API expone OpenAPI en `/api/docs`; cada respuesta de error tiene un formato consistente y un `requestId` para trazabilidad. Las rutas operativas por sucursal requieren asignación explícita del usuario a esa sucursal.

- Las referencias externas de medicamentos y precios se integrarán mediante adaptadores autorizados (API o archivo con licencia). Sus datos son sugerencias editables: nunca modifican por sí solos el catálogo ni los precios comerciales históricos.

- Al confirmar un producto creado desde una referencia externa, el laboratorio sugerido se vincula si ya existe o se crea dentro de la misma transacción. Seleccionar una referencia por sí solo no crea registros internos.

- Al abrir Productos se preparan de forma idempotente las categorías iniciales (Medicamentos, Dermocosmética, Perfumería, Accesorios, Suplementos e Higiene). Elegir una referencia externa asigna Medicamentos; el operador puede cambiarla antes de guardar.
- La unidad de venta se guarda por producto como caja, blíster o unidad. No se convierten cantidades entre presentaciones hasta definir una equivalencia comercial por producto.

- Los cierres de caja conservan efectivo esperado, contado y diferencia calculados desde el fondo inicial, los cobros en efectivo y los movimientos manuales. El motivo de una diferencia permanece opcional por ahora; el historial y los reportes se consultan por rango, día y mes en horario de Argentina.
- Los productos vinculados explícitamente a una referencia externa se revisan automáticamente a las 09:00 y 17:00 de Argentina (UTC-3). El proceso actualiza únicamente el precio de referencia sugerido y su fecha de comprobación; el precio comercial de venta sigue siendo una decisión manual.

- Cuenta corriente: saldo por cliente y organización, con sucursal de origen en cada movimiento. Crédito deshabilitado por defecto; límite cero no permite nuevas compras. Las ventas financiadas validan el límite dentro de una transacción serializable y no generan vuelto.
- Los cobros admiten efectivo, tarjeta o transferencia; no pueden superar la deuda. Cada recibo tiene una clave idempotente. Efectivo exige caja abierta de la sucursal y registra el ingreso en la misma transacción. Deshabilitar el crédito no impide cobrar saldos anteriores.
- Anular una venta compensa su deuda mediante un crédito, sin borrar movimientos; si ya hubo cobros puede quedar saldo a favor. Las devoluciones físicas conservan su circuito previo de recepción sin reintegro financiero automático.

- En Ventas, seleccionar Cuenta corriente prepara automáticamente el saldo restante como financiación, conserva otros pagos y no duplica el importe al repetir la selección. La venta se registra únicamente al pulsar Confirmar venta; la API mantiene la validación del crédito.

- Modo sin internet (07/11/2026, epic "Modo sin internet"): la farmacia sigue operando sin conexión y sincroniza al volver. Decisiones del usuario: las ventas hechas sin conexión que choquen al sincronizar (precio cambiado, stock que no alcanza, límite de crédito) se registran con el precio cobrado y quedan "a revisar", sin stock negativo; la factura C pedida sin conexión se emite con CAE al volver; el Ticket nunca va a ARCA; un cobro de cuenta corriente mayor a la deuda deja saldo a favor y aviso; una PC puede trabajar sin conexión hasta 24 h desde la última sincronización. Abrir/cerrar caja, compras, recepciones, transferencias y catálogo siguen necesitando conexión. Primer paso (SISTEMA-62): la app abre sin conexión en modo consulta. Ver `OFFLINE.md`.

- Cola fiscal automática (07/11/2026, SISTEMA-61): las facturas y notas de crédito que quedan en cola o por confirmar se envían y concilian solas cada minuto, dentro del proceso de la API, sin servicios ni colas externas. Reemplaza la decisión anterior de "no hay worker". Es la base para facturar ventas hechas sin internet (epic "Modo sin internet"). Las facturas de ventas ya hechas se emiten aunque la farmacia esté bloqueada por falta de pago. No activa emisión productiva: en producción sólo corre con la bandera habilitada.

- Envío de operaciones de otro usuario de la PC (11/11/2026, SISTEMA-87, prueba completa con dos PCs): "queda para su dueño" se decide por una señal explícita de la API (`code: "PARA_SU_DUENO"` en el 409 de la clave no registrada) o por un 403 de quien manda, no por el número de estado. Los 404/409 de negocio (conflictos de la operación) son rechazos definitivos: frenar la sucursal por ellos trababa todas las ventas de la PC hasta que volviera a entrar quien las hizo.

- Soporte desde el panel de plataforma (11/11/2026, SISTEMA-89, decisión del usuario): el superadmin puede entrar como cualquier usuario de una farmacia y operar igual que él, para reproducir y arreglar problemas, sin que la farmacia lo vea. Reemplaza la decisión del 06/11 de no entrar como una farmacia (`PLATFORM.md`). Límites: la sesión dura hasta volver al panel (tope de 7 días, sin renovación), sin ARCA producción, registro sólo en la auditoría de la plataforma. Conviene que los términos de servicio contemplen el acceso del soporte.

- Mensajes de error en castellano (11/11/2026, SISTEMA-91): los mensajes de la API que llegan a la pantalla (ventas, devoluciones, stock, transferencias, catálogo, usuarios, sesión) pasan del inglés al castellano rioplatense. Los internos que nunca ve el usuario (transporte con ARCA, bóveda de credenciales, configuración) quedan como estaban. La web no compara textos de error, así que no cambia nada más. Quedan como estaban, por decisión del usuario, el login sin límite de intentos y el costo del lote que vuelve a entrar por Compras (conserva el primero, `PURCHASES_V2.md`).

- Sesión de otro usuario en otra pestaña (11/11/2026, SISTEMA-92): la sesión sigue en una sola cookie httpOnly por navegador, pero una pestaña nunca cambia de usuario sola. Al renovar manda el usuario con el que empezó; si la cookie es de otro, la API responde 409 `SESION_DE_OTRO_USUARIO` (con el email del otro en `details`), sin token nuevo y sin revocar la otra sesión. Sin el campo responde como antes. La pestaña se pausa sin desmontar la pantalla, para no perder la venta a medio cargar, y deja de mandar pedidos. Desde la pausa se vuelve a entrar con la contraseña propia en el lugar, en vez de ir a la pantalla de ingreso, por el mismo motivo. Las pestañas se avisan al entrar y salir con `BroadcastChannel`. Ver `OFFLINE.md`.

## OPEN

- Credential recovery policy for production.

## DEFERRED

- Docker/WSL execution queda diferido como alternativa de entorno, porque esta computadora usa PostgreSQL nativo para evitar problemas de estabilidad.
- JSON contract for monetary BigInt values is deferred until money is needed.

# Tickets de cobro de cuenta corriente

14/09/2026 (decisión vigente): se recupera RAW V21 con envío directo en un clic, sin vista previa ni diálogo del navegador. Componente administrado por tarea por usuario y supervisor con recuperación; indicador en Gestión. No se reenvían automáticamente resultados inciertos. Esta decisión reemplaza el cambio a HTML registrado abajo; se mantienen encabezado configurable, nombre del empleado y alineaciones corregidas.

14/09/2026: por pedido del usuario se reemplaza la impresión RAW principal por plantilla HTML e impresión del navegador integrada, sin iniciar ni consultar al agente. Se conserva el código RAW como legado. Nombre de quien atiende por organización en UserOrganization.displayName; nunca se imprime el email como fallback. Se retiran los ejemplos personales de los inputs de Organización. Esta decisión reemplaza la dependencia del agente descrita abajo. Ver THERMAL_TICKETS.md.

El encabezado común de tickets se configura en Administración → Organización: nombre del comercio (independiente del nombre administrativo), dirección, ciudad, provincia, CUIT y teléfono. Se guarda en PostgreSQL por organización, con permisos y auditoría. No se rellenan campos vacíos con datos del agente. Se retiran las dos líneas finales de operación/leyenda del papel y la vista previa sin alterar la naturaleza interna ni los identificadores guardados.

La impresión de ventas y cobros se unifica en V21, con agente local Windows RAW ESC/POS en 127.0.0.1:17890 y vista previa compartida. El contrato transporta centavos y consume importes persistidos, sin recalcular precios ni modificar operaciones. Cada envío usa requestId y reserva persistente para impedir repeticiones accidentales. Ver [THERMAL_TICKETS.md](THERMAL_TICKETS.md).

Se reutiliza el formato térmico de ventas (80 mm) para imprimir luego de cobrar y desde Historial. Los nuevos recibos guardan una instantánea inmutable en la auditoría transaccional existente, sin migración; reimprimir no modifica deuda ni caja. Incluyen importes efectivamente aplicados por artículo, no el total original de la venta. Para recibos anteriores sin instantánea no se inventa saldo histórico.
