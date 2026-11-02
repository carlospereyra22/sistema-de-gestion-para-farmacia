# Interfaz y navegación del sistema

Documento consolidado; conserva las decisiones de implementación de cada apartado. El catálogo externo y sus imágenes se documentan en [EXTERNAL_PRODUCT_CATALOG.md](EXTERNAL_PRODUCT_CATALOG.md).

## Pantalla completa

El menú de cuenta ofrece «Pantalla completa», antes de «Cerrar sesión». Usa la Fullscreen API nativa sobre `document.documentElement`, no zoom, ventanas nuevas ni un modo visual que simule ocultar el navegador. No cambia datos ni recarga la aplicación.

Al estar activo muestra «Vista normal». El título al pasar el mouse conserva la explicación completa de cada acción. Esc y las salidas iniciadas por el navegador se sincronizan mediante `fullscreenchange`; no se bloquea el teclado. La solicitud se inicia directamente desde el clic y no se activa automáticamente ni se persiste tras recargar. Si el navegador no lo permite o rechaza la solicitud, muestra una notificación sin modificar el estado de trabajo. No intenta controlar el modo independiente de pantalla completa iniciado con F11.

El documento completo incluye los diálogos y notificaciones; los diseños adaptables existentes siguen respondiendo al espacio disponible. El menú conserva el cierre de sesión y su confirmación de venta pendiente. El desplegable tiene 208 px de ancho tanto en escritorio como en notebook, alineado a la derecha del control de cuenta, con textos cortos para evitar espacio vacío innecesario.

Referencia: [Fullscreen API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide).

Verificación local (10/10/2026): 339 pruebas web, lint, tipos y build aprobados. Continúa el aviso no bloqueante de tamaño del bundle. Prueba de navegador Edge headless con el componente real y CSS de la aplicación: entrada nativa por clic, salida desde el menú, sincronización tras salida externa mediante `document.exitFullscreen()`, aviso con API deshabilitada y conservación de un campo sin guardar. Captura del menú a 1366 px en `.cache/fullscreen-menu-notebook.png`. No se probó Esc físicamente, otros navegadores ni una venta autenticada completa. La página temporal se retiró; no se publicó en producción.

## Vista compacta para notebook

La adaptación usa ancho disponible en píxeles CSS, no detección del equipo: una notebook con monitor externo grande conserva escritorio, y una ventana pequeña de escritorio activa la vista compacta.

- Desde 1800 px se conserva el diseño amplio: menú de 252 px y encabezado de 82 px. La vista de 1920 px no cambia.
- Por debajo de 1800 px el menú es una columna de iconos de 72 px. Los botones conservan nombres accesibles y muestran una etiqueta flotante al pasar el cursor o enfocar con teclado. Una sola etiqueta a la vez, fuera del contenedor desplazable; desaparece al salir, hacer clic, pulsar Escape, desplazar o redimensionar. Se respeta la preferencia de movimiento reducido y no se duplica con el título nativo.
- Entre 1024 y 1799 px el encabezado mide 56 px. La cuenta muestra avatar y flecha; el menú desplegado mantiene su ancho de 260 px con organización, sucursal y cierre de sesión. La sucursal también sigue disponible en el selector de la página.
- En ese mismo rango, la franja compartida por todas las secciones usa título de 20 px, acciones y selector de 36 px y separaciones reducidas. Actualizar referencias conserva su fecha; la descripción de Listas de precios se compacta sin ocultarla. Las acciones pueden pasar a otra línea si no caben. Las reglas sólo afectan controles directos de la franja, no formularios o ventanas abiertas desde ellos. Ventas aprovecha los 16 px recuperados de altura.
- Desde 1024 px Ventas usa dos columnas iguales: catálogo y Venta actual (ver «Ventas» más abajo). Entre 1024 y 1799 px se reduce espacio exterior y la grilla del carrito, sin escalar la página. El caso de 1606 px queda incluido en esta vista y ya no activa prematuramente el menú ancho.
- Entre 1024 y 1199 px (incluido zoom elevado) el catálogo oculta la columna Categoría según el ancho de la propia tabla y el carrito oculta miniaturas. En pantallas aún menores se apila.

No cambia cobros, impuestos, permisos, precios ni comportamiento del escáner. Pruebas automatizadas cubren nombres accesibles y límites declarados del CSS; no sustituyen la validación visual con zoom y hardware reales.

### Altura de Venta actual

Desde 1200 px de ancho y hasta 950 px de alto disponible, Venta actual reduce relleno del encabezado, contexto y pie, y el botón Cobrar baja a 48 px (nunca menos de 44 px). Conserva tamaños de texto e importes. A mayor altura se conserva el espaciado original.

## Ventas (SISTEMA-16, 01/11/2026)

Rediseño «Propuesta E». Plan y referencia visual en `docs/ventas-rediseno/`.

- **Catálogo (izquierda):** un único buscador (lector y F2) con filtros Categoría y Con stock (apagado por defecto). Tabla con Producto, Categoría, Stock y Precio; stock bajo (≤ 5, `lib/stock-level.ts`) con punto ámbar y «Sin stock» como chip. Sin búsqueda muestra todo el catálogo, también sin stock, con un tope de 200 filas. Debajo, el detalle del producto elegido con cantidad, Agregar (Enter) y Limpiar (Esc). Los productos sin stock se pueden elegir pero no agregar.
- **Venta actual (derecha):** cliente y lista de precios, líneas con cantidad, precio, descuento y subtotal, marca «Recién agregado» en la última línea, conceptos manuales en el menú «…». El pie en una sola fila tiene descuento general (% o $), el único total grande y Cobrar (Ctrl + Enter).
- **Ventana de cobro:** alto fijo (580 px o el alto disponible) para que no cambie al sumar pagos o avisos; el cuerpo hace scroll. Medios 1–4 (cuenta corriente sólo con cliente habilitado), comprobante Ticket / Factura, importe con formato mientras se escribe (`1000` → `1.000,00`), botón Exacto, montos rápidos en efectivo, vuelto a entregar y, si el importe no alcanza, «Faltan $ X. ¿Con qué medio se completa?». Enter con importe parcial registra ese pago y precarga lo que falta. Los errores se muestran dentro de la ventana y el reintento conserva el mismo `clientOperationId`.
- **Venta confirmada:** Imprimir ticket es la acción principal (Enter); después de imprimir, Nueva venta pasa a ser la principal (Enter, Enter). Esc o la X cierran. Muestra cliente, comprobante interno, vuelto y, a pedido, la vista previa del ticket de 80 mm con la misma plantilla de impresión.
- **Encabezado:** pastilla de caja: «Caja abierta», «Sin caja · el cobro queda pendiente» o «Sin caja abierta».
- **Atajos:** F2 buscar; escribir en cualquier lugar inicia la búsqueda; ↑ / ↓, Enter, doble clic y Esc en el catálogo; + / − suman o restan en la última línea fuera de campos; Ctrl + Enter abre el cobro o lo confirma; 1–4 eligen medio dentro del cobro fuera de campos. Se bloquean con venta inactiva, venta por retomar, envío en curso o ventana abierta.

Todo cálculo de la web (vuelto, montos rápidos, porcentaje) es vista previa: el backend sigue validando precios, stock, pagos y comprobantes.

## Adaptación del escritorio

El diseño se adapta al ancho disponible en píxeles CSS, no a las pulgadas del
monitor. No se aplica `zoom` ni se bloquea la ampliación del navegador.

- Desde 1600 px se conserva el menú lateral de 252 px y las proporciones de la
  vista de referencia de 1920 px.
- Entre 1440 y 1599 px el menú ocupa 184 px; por debajo, una barra de iconos de
  72 px conserva los nombres accesibles y las ayudas al pasar el cursor.
- Ventas usa catálogo y Venta actual en dos columnas iguales desde 1024 px; el
  cobro se hace en una ventana. El carrito y sus encabezados usan la misma
  cuadrícula.
- El área de ventas tiene un mínimo de 620 px de alto. En ventanas bajas se
  permite desplazamiento vertical; catálogo y líneas tienen scroll propio.
- Por debajo de 1024 px Ventas se apila (catálogo arriba, venta abajo) y el pie
  con Cobrar queda fijo al pie de la pantalla.
- Los cuatro filtros de Productos y el resumen lateral de Listas de precios
  se disponen en columnas desde 1024 px.
- La adaptación es transversal: los hijos de cuadrículas pueden contraerse,
  los campos no exceden sus contenedores y las tablas con desplazamiento lo
  conservan dentro de su panel. Esto incluye Inicio, Categorías y laboratorios,
  Caja y Reportes, además de Productos, Ventas y Listas.
- Inventario, Compras, Transferencias, Clientes, Proveedores, Usuarios, Roles
  y Organización comparten `workspace-split`: listado flexible y formulario
  lateral de al menos 280 px desde 1024 px; en escritorio amplio el lateral
  ocupa 360 px. Por debajo se apilan sin ocultar controles.
- Cuentas corrientes usa un selector de clientes proporcional al espacio
  disponible, con mínimo de 200 px, y un panel de detalle flexible.

### Validación visual pendiente

Comprobar en navegador 1920×1080, 1536×864, 1366×768, 1280×720 y 1024×768
(dimensiones del viewport), además de ventana reducida por debajo de 1024 px.
Revisar carrito vacío y con nombres largos, cantidades e importes grandes,
pagos múltiples, cuenta corriente, navegación por teclado y listas con cambios
pendientes. Confirmar que el documento no requiere desplazamiento horizontal
y que se puede alcanzar Confirmar venta. Las pruebas unitarias y la compilación
no sustituyen esta comprobación visual.

Repetir la comprobación en todas las entradas del menú, incluyendo Usuarios,
Roles y permisos y Organización. Usar nombres largos de productos, clientes,
proveedores y sucursales, correos extensos y tablas con suficientes registros.

## Navegación y actualización visual

- Cambiar de módulo o sección principal reinicia el scroll del documento antes de pintar la pantalla. Aplica a menú, accesos rápidos, alertas, historial y navegación atrás/adelante. Se desactiva la restauración automática del navegador mientras está montado el workspace; se restaura su configuración al salir.
- Renovar la sesión o recuperar foco no reinicia el scroll. Se conserva la renovación de credenciales y sus controles de expiración.
- Inicio queda montado después de la primera visita, oculto al cambiar de apartado. Al volver revalida resumen y ventas sin borrar el contenido anterior. No se consulta desde Inicio oculto. El contexto organización/sucursal cambia la identidad y descarta su contenido anterior; no existe caché global ni persistente.
- Reportes queda montado después de la primera visita, oculto al cambiar de apartado (01/11/2026). Oculto no consulta. Al volver revalida opciones y Resumen sin mostrar el esqueleto si los filtros son los mismos; con filtros distintos (por ejemplo, porque la URL de otro apartado no los arrastra) carga de nuevo. Los gráficos no se recrean. Cambiar de organización descarta el contenido anterior.
- Últimas ventas conserva filas durante la reconsulta y sólo presenta datos del contexto vigente. Respuestas de efectos cancelados no reemplazan datos nuevos. Los errores se informan sin vaciar el último resultado.
- La campana deja de usar el token como identidad React: conserva estado al renovar credenciales, pero cambia de identidad por usuario/organización/sucursal.
- Historiales de inventario, compras y transferencias conservan filas al reconsultar el mismo contexto. Detalle de compra en cuentas corrientes conserva su resultado por organización/sucursal/cliente/movimiento. No se omiten consultas ni comprobaciones del servidor.
- El buscador de medicamentos ya no cancela una búsqueda en curso sólo porque se renueva el token; sigue cancelándose al cambiar de organización o desmontarse.

### Verificación

Recorrido de navegador con WorkspaceShell real y API simulada con demora de 700 ms: Inicio desplazado → acceso a Clientes, regreso a Inicio, renovación de token y eventos de foco/visibilidad, Ver historial, Atrás y cambio de sucursal. Se verificó scroll inicial al navegar, scroll conservado al renovar sesión, identidad DOM de Inicio/filas conservada y descarte del resultado de la sucursal anterior. Ninguna escritura ni credencial real en la prueba.

Auditoría adicional de cargas: logo de organización ya conserva resultado por contexto; cuentas corrientes y paneles de vencimientos ya conservan montaje; ventas conserva borrador y su flujo de revalidación. No se mantienen todos los módulos montados indiscriminadamente ni se modifica autorización, operaciones comerciales o configuración fiscal para ocultar estados de error.

Esto no garantiza ausencia de cualquier parpadeo en todos los equipos: la primera carga necesita red y los cambios de contexto requieren datos nuevos. Queda pendiente validar minimizar/restaurar físicamente la ventana en el equipo del usuario y el recorrido productivo tras publicar.

## Barra lateral

El margen entre navegación y contenido es compartido por todos los apartados: 12 px en escritorio/tablet y 8 px en móvil. Se aplica tanto con el menú abierto como comprimido, sin alterar su ancho ni el padding interno de las tarjetas. El margen derecho se conserva.

El botón de la cabecera alterna la navegación completa (252 px) y el riel de íconos (72 px), sin desmontar el contenido ni descartar formularios. Usa aria-expanded, aria-controls y un nombre accesible. Los íconos conservan nombres y ayudas al pasar el mouse o enfocar, también en escritorio cuando se contrae manualmente. Se mantienen las dimensiones y separaciones anteriores; se oculta solamente el indicador de scroll del lateral, conservando desplazamiento con rueda, gestos y teclado. Las demás barras del sistema siguen visibles.

Se conserva el umbral existente de 1800 px CSS: al entrar, escritorio amplio expandido y resoluciones menores contraídas. Al cruzar ese umbral se restablece el modo correspondiente; dentro del mismo rango se respeta la elección manual. No se guarda una preferencia permanente ni se identifica el tipo de dispositivo. En móvil (menos de 768 px), expandir superpone el lateral sobre el contenido, con fondo para cerrarlo.

La cabecera permanece visible. ResizeObserver mide su altura real (incluidas filas adicionales) y el lateral ocupa el resto de 100dvh, con desplazamiento propio, espacio al pie y acceso a los últimos botones. El tooltip se posiciona fuera del contenedor desplazable. No cambia rutas, permisos, selección de sucursal ni datos comerciales.

Verificación en Edge headless con una página temporal usando los componentes reales: 1920×1080, 1366×768, 1024×600, 768×900 y 390×700; valores predeterminados, alternancia, altura al pie del viewport, acceso al último elemento y scroll de página. La página temporal fue retirada. Captura local: `.cache/sidebar-expanded.png`.
