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
- Entre 1200 y 1799 px Ventas conserva tres columnas, con mínimo de 330 px para cobro, controles de cantidad sin comprimir y desplazamiento interno independiente del botón de confirmar. Se reduce espacio exterior, no se escala toda la página. El caso de 1606 px queda incluido en esta vista y ya no activa prematuramente el menú ancho.
- Entre 1024 y 1199 px (incluido zoom elevado) se muestran búsqueda y carrito, con cobro debajo a todo el ancho para evitar campos superpuestos. En pantallas aún menores se mantiene la distribución vertical previa.

No cambia cobros, impuestos, permisos, precios ni comportamiento del escáner. Pruebas automatizadas cubren nombres accesibles y límites declarados del CSS; no sustituyen la validación visual con zoom y hardware reales.

### Altura del panel de cobro

Desde 1200 px de ancho y hasta 950 px de alto disponible, el panel de cobro reduce relleno y separaciones incluso en escritorio ancho. Conserva tamaños de texto, avisos, métodos e importes; la cuenta corriente y confirmación mantienen al menos 44 px de alto. No cambia el menú, encabezado, carrito ni modal de cobro. A mayor altura se conserva el espaciado original. El contenido sigue siendo desplazable cuando hay pagos/avisos extra; confirmar permanece en el pie independiente.

## Adaptación del escritorio

El diseño se adapta al ancho disponible en píxeles CSS, no a las pulgadas del
monitor. No se aplica `zoom` ni se bloquea la ampliación del navegador.

- Desde 1600 px se conserva el menú lateral de 252 px y las proporciones de la
  vista de referencia de 1920 px.
- Entre 1440 y 1599 px el menú ocupa 184 px; por debajo, una barra de iconos de
  72 px conserva los nombres accesibles y las ayudas al pasar el cursor.
- Ventas mantiene búsqueda, carrito y cobro en tres columnas desde 1024 px.
  El carrito y sus encabezados usan la misma cuadrícula compacta, sin imponer
  un ancho mínimo de 500 px al panel central.
- El área de ventas tiene un mínimo de 620 px de alto. En ventanas bajas se
  permite desplazamiento vertical; el cobro tiene desplazamiento propio para
  no ocultar pagos adicionales ni la confirmación.
- Por debajo de 1024 px Ventas sigue apilada para conservar controles legibles.
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
