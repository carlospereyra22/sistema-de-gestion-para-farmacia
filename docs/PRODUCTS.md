# Productos: operación y mantenimiento

Categorías adaptables (29/10/2026): crear o editar una categoría funciona normalmente, sin popup de coincidencias ni configuración de términos. Al completar una ficha del catálogo interno por código, el servidor consulta el árbol vigente de la organización y adapta su clasificación a las categorías y subcategorías actuales. Usa nombre, presentación y clasificación explícita de la fuente, con equivalencias conocidas y contexto de los padres. Una subcategoría específica puede ganar sobre una categoría general cuando todos sus datos coinciden. Ante ambigüedad entre ramas queda para revisión manual. Renombrar, mover o desactivar categorías se refleja en la próxima carga. No mueve productos comerciales ya guardados ni reescribe las fichas originales de las fuentes.

Marca y tipo de producto (26/10/2026): Marca es independiente de Laboratorio, editable y autocompletable desde una ficha externa confirmada. Se muestra debajo del nombre, participa en la búsqueda y puede filtrarse desde Filtros adicionales, junto con Medicamentos/Otros productos. No se deduce una marca del laboratorio.

El interruptor Es medicamento está en el encabezado, junto al cierre. Un alta comienza en modo automático: prioriza el tipo guardado para el código; si no existe, una referencia exacta del catálogo no medicinal tiene prioridad sobre el padrón. Sin referencia no medicinal se consulta el padrón y una coincidencia exacta única puede completar y vincular el medicamento. Cambiar el interruptor fija una decisión manual durante ese formulario; ninguna respuesta tardía la reemplaza. Los productos normales ocultan Laboratorio y receta, conservan Marca y Presentación, y ofrecen Unidad / envase completo o Caja / pack completo sin nuevas conversiones de stock. Las unidades existentes se preservan al editar. En fichas existentes, desactivar Es medicamento y guardar quita la vinculación medicinal y la receta, conserva los datos descriptivos y el precio actual (incluido fraccionamiento), y audita el cambio. La migración mantiene el comportamiento de los productos previamente vinculados, con receta o categorizados como Medicamentos; la revisión de clasificaciones existentes es explícita.

Documento consolidado; conserva las decisiones de implementación de cada apartado. El catálogo externo y sus imágenes se documentan en [EXTERNAL_PRODUCT_CATALOG.md](EXTERNAL_PRODUCT_CATALOG.md).

## Encabezado de Productos

El título y la última actualización permanecen en la cabecera global. Los cuatro indicadores se muestran en una franja blanca dentro de Productos, encima del buscador, con separadores suaves, números de 26 px e iconos lineales sobre fondos circulares suaves. Una línea superior identifica cada indicador: azul para total, verde para activos, rosa para sin stock y ámbar para stock bajo, también cuando su valor es cero. Nuevo producto aparece al lado de los indicadores. En anchos menores la acción pasa a otra fila y los indicadores se distribuyen en dos columnas en móvil. La tabla conserva su desplazamiento independiente.

- Total y activos usan el catálogo de la sucursal antes de aplicar filtros.
- Sin stock conserva el criterio de Productos: activos sin existencias físicas. Los lotes vencidos siguen siendo stock físico.
- Stock bajo usa el umbral confirmado por el usuario: activos con entre 1 y 5 unidades disponibles para vender, sumadas por producto. Excluye cero, archivados y existencias vencidas no vendibles. Es un indicador, no una nueva regla de compra o bloqueo.
- La búsqueda agrega laboratorio y comparación sin acentos a nombre/código.
- Vencimiento filtra por existencia de lotes con cantidad positiva: vencidos, próximos 90 días (sin vencidos) o sin fecha. Usa el estado de disponibilidad existente de Inventario, no un criterio alternativo.
- Filtros abre un modal de tamaño estable con opciones adicionales de vinculación de precios, foto y código de barras. Se combinan con los filtros principales y se confirman con Aplicar; Cancelar descarta el borrador. Limpiar adicionales prepara su restablecimiento sin cambiar los filtros principales. El botón indica cuántos adicionales están activos. Cambiar filtros restablece la página; Estado conserva acceso a Archivados. Estos filtros sólo consultan datos ya cargados, sin operaciones comerciales ni cambios de catálogo.
- Los cinco filtros usan controles propios con toda la superficie clickeable, lista blanca del mismo ancho del filtro, bordes suaves, resaltado verde y marca de selección. Admiten flechas, Inicio/Fin, Enter/Espacio, búsqueda por letras, Escape, Tab y cierre al pulsar fuera; listas largas conservan desplazamiento por rueda, gesto y teclado con barra fina verde grisácea y pista suave para señalar que hay más opciones. El espacio de la barra se reserva para evitar saltos del contenido.
- Los cuatro KPI conservan sus cálculos y no cambian al filtrar el listado. Nuevo producto mantiene el mismo formulario y validaciones.
- Crear, gestionar, archivar y actualizar precios mantienen los circuitos existentes. Ninguna operación comercial ni migración nueva.

## Fotos manuales de productos

Usuarios con `CATALOG_MANAGE` pueden subir, cambiar o quitar una foto al crear o editar un producto desde cualquier dispositivo compatible. `CATALOG_READ` permite verla solo dentro de su organización. El backend revalida permisos y pertenencia del producto; no hay URLs públicas ni búsquedas automáticas de imágenes.

Productos muestra Foto → Producto → Código de barras. La miniatura carga cuando se acerca al área visible y permite ampliar la foto. Los productos sin foto conservan un marcador neutro.

En Productos, tocar la miniatura (también el marcador sin foto) abre una ventana con imagen ampliada, Subir/Cambiar, Quitar, Deshacer y Guardar foto. El guardado desde el listado envía exclusivamente `imageDataUrl` al PATCH existente; no reenvía precios ni campos del producto. Cancelar, Escape o clic afuera descartan la edición de la ventana; durante procesamiento/guardado se bloquea el cierre. Los errores permanecen en la ventana para reintentar.

En nuevo/editar producto, una miniatura en el encabezado de datos abre la misma ventana. Aplicar deja el cambio pendiente hasta guardar el producto; cancelar el formulario no guarda la foto. No hay controles de foto debajo de la miniatura. En Ventas se conserva exclusivamente la vista ampliada, sin edición. La vinculación se despliega inicialmente en productos nuevos y comienza cerrada al editar, con estado y fuente visibles. Nombre, código, categoría, laboratorio, precio y unidad permanecen visibles. Detalles farmacéuticos y observaciones son secciones plegables: sus campos siguen montados y conservan los valores/autocompletado al cerrarlas. Guardar y Cancelar permanecen en el pie fijo.

Se aceptan archivos originales JPG/PNG/WebP de hasta 10 MB. El navegador los decodifica, conserva proporción, aplica fondo blanco si son transparentes y exporta JPEG (800 px como objetivo, reduciendo tamaño/calidad si hace falta). Al reexportar se eliminan los metadatos originales. No se almacena el original. El backend limita a 60 KB, comprueba base64 canónico, marcadores JPEG y dimensiones máximas de 1024 × 1024; no ejecuta contenido externo ni acepta SVG o HTML. Esta comprobación de estructura no equivale a una decodificación completa del JPEG en el servidor.

`imageDataUrl` en crear/editar: ausente conserva la foto; `null` en editar la quita; cadena reemplaza la foto. Producto, imagen y auditoría se guardan en la misma transacción, de modo que un código de barras duplicado no deja una imagen guardada por separado. La lista devuelve solo fecha de actualización de la foto, nunca los bytes. `GET .../products/:productId/image` devuelve el JPEG como data URL, con autorización y `Cache-Control: private, no-store`.

La migración `20260913000000_product_images` agrega una tabla y no altera registros comerciales existentes. Las fotos viajan en los respaldos PostgreSQL actuales. Para producción: ejecutar `prisma migrate deploy`, generar el cliente Prisma y desplegar backend y frontend. No hay bucket, claves externas ni carpeta local que copiar. Los clientes deben abrir la instancia de producción para compartir las fotos; la base local de pruebas sigue siendo independiente.

Validación local: probar subir y guardar, recargar, abrir desde otra sesión autorizada, reemplazar, quitar y cancelar sin guardar. No se presume que estas pruebas de navegador hayan sido realizadas solo porque TypeScript compile.

Actualización 24/10/2026: el popup de producto ofrece carga directa de foto dentro de Datos del producto, con miniatura, reemplazo y quitar. Se prepara como borrador y viaja en el mismo guardado transaccional existente; cancelar descarta la foto pendiente. No se requiere abrir otra ventana. La consulta por código conserva sus resultados al renovar la sesión al volver a la pestaña; un nuevo código o una búsqueda explícita sí vuelve a consultar.

## Categoría y laboratorio desde el producto

Los formularios de alta/edición de Productos (incluido el editor abierto desde Listas de precios) permiten buscar categorías y laboratorios y crear una opción sin salir del borrador. El control conserva el tamaño del campo anterior. Muestra resultados acotados y una acción explícita «+ Crear “nombre”» cuando no existe un nombre equivalente entre las opciones cargadas. Enter selecciona una coincidencia o la opción recorrida con flechas, pero nunca crea ni envía el producto por accidente. Escape descarta la búsqueda; un texto pendiente sin elegir/crear bloquea la validación del formulario.

Crear usa los endpoints existentes de la organización, con su autorización CATALOG_MANAGE y validación de servidor. Se selecciona el ID devuelto por el servidor y se agrega a las opciones locales, sin recargar el formulario ni perder nombre, precio, código o imagen. No cambia stock, precios ni referencias externas. Las sugerencias de laboratorio de la vinculación conservan el comportamiento previo hasta que se elige otra opción.

Los nombres se recortan, se colapsan espacios y se validan entre 2 y 120 caracteres. La búsqueda ignora acentos/mayúsculas; para reutilizar una opción existente se compara el nombre completo sin diferenciar mayúsculas ni espacios redundantes. La unicidad persistida sigue siendo la del servidor por organización y nombre; no se altera el tratamiento de opciones archivadas.

El alta de una categoría/laboratorio se confirma al pulsar Crear y es independiente del guardado del producto: permanece disponible aunque después se cancele el producto. Mientras se crea, se evita el doble envío y se bloquea guardar/cerrar el producto. Ante error se conserva el borrador y se muestra el mensaje junto al campo. Sin cambios de esquema, migraciones, permisos ni endpoints.

Verificación local (10/10/2026): 350 pruebas web aprobadas, lint, tipos y build correctos; persiste el aviso no bloqueante de tamaño del bundle. Edge headless con el componente/CSS reales y altas simuladas verificó selección, creación explícita, IDs devueltos, bloqueo durante la espera, error/reintento, validación de texto sin confirmar y conservación de otros campos. Inspección visual en `.cache/catalog-inline-options.png`; página temporal retirada. No se crearon registros reales ni se hizo una prueba autenticada de punta a punta. No publicado en producción.

## Precios de productos vinculados

Productos ofrece un desplegable junto al botón Buscar para elegir Padrón oficial (predeterminado para productos nuevos), AlfaBeta o Precios de Remedios. Al editar, se selecciona la fuente del vínculo guardado. La búsqueda de la tabla sigue filtrando el catálogo propio. En el formulario se elige un medicamento y su presentación exacta; se guarda la fuente del resultado seleccionado, no la del selector de búsqueda, junto con nombre y presentación en los campos existentes. Cambiar de fuente para explorar no modifica el vínculo hasta elegir un resultado y guardar. No requiere migraciones. Vincular no cambia el nombre de un producto ya existente ni borra su código de barras cuando la fuente no lo informa. El padrón completa principio activo y otros datos cuando están disponibles. El código comercial sólo procede del envase escaneado o de una entrada explícita: una búsqueda por nombre no copia el EAN de la referencia. Si la ficha elegida informa un EAN diferente del escaneado, el formulario impide vincularla y muestra ambos códigos. El conector de AlfaBeta aporta nombre, laboratorio, presentación y precio, sin inventar campos ausentes. No se mezclan automáticamente las fuentes.

Cuando Es medicamento está activado o el producto ya está identificado como medicinal, la consulta por código utiliza únicamente el buscador medicinal; no llama al catálogo externo no medicinal. En modo automático sin tipo conocido, se consulta el catálogo no medicinal para clasificar el código y, si no hay coincidencia, el padrón medicinal.

La tarea de la API corre a las 09:00 y 17:00 de Argentina (12:00 y 20:00 UTC). Requiere la API encendida; no es un cron del sistema operativo y no recupera horarios perdidos durante una caída. El botón de actualización usa el mismo servicio.

Antes solo se actualizaba la referencia. Ahora también se reemplaza el importe de la lista «Precio general» para productos activos vendidos por caja. Se aplican aumentos y bajas, sin margen. Las demás listas y las ventas, deudas y costos históricos se conservan. No se convierten precios de caja a blíster/unidad.

Los vínculos anteriores mantienen su proveedor; no se reasignan automáticamente a AlfaBeta. Para cambiarlo, buscar la presentación en el formulario y guardar. AlfaBeta se resuelve por nombre exacto único y presentación exacta única, no por proximidad; si no hay coincidencia segura se conserva el precio. No se recorre todo el catálogo externo: se consultan los productos vinculados, reutilizando la caché existente. El conector público depende del formato del proveedor; no sustituye un acceso comercial acordado.

Las peticiones externas ocurren antes de la transacción. Dentro de ella se bloquea el producto, se comprueba que siga activo y con el mismo vínculo y se actualizan referencia, precio y auditoría juntos. Sin precio válido o ante fallo de consulta se conserva el importe y se registra una advertencia. El contador de actualizados incluye cambios de referencia o precio de venta; la fecha de revisión solo se avanza ante una referencia válida.

Implementación local: requiere desplegar frontend y backend para aplicarse en producción.

## Errores al guardar productos

Crear o editar un producto comprueba la disponibilidad del código de barras, conservando su unicidad existente. El código del propio producto no es un conflicto. Un duplicado responde HTTP 409 con el código y, solo dentro de la misma organización, el nombre del producto que lo tiene. Se controlan también colisiones concurrentes de la restricción única de código; otros errores no se reinterpretan como duplicados.

El formulario muestra el error en un diálogo modal nativo con estilo teal/ámbar, título y descripción accesibles. Permite cerrar con Escape, la cruz o «Volver al formulario», conserva los campos y devuelve el foco. No descarta ni guarda automáticamente datos y no permite reutilizar un código ocupado. No se modifica el esquema ni se eliminan productos para resolver conflictos.

## Categorías y laboratorios

La migración `20261016030000_expand_category_appearance` amplía las restricciones sin modificar selecciones guardadas: 23 iconos explícitos más Automático y 15 colores más Automático. Incluye bebés, termómetro, curaciones, inyectables, control médico, botiquín, salud bucal, ojos, oídos, gotas, manicura, protección solar, natural, nutrición y preparados. La grilla de iconos tiene altura limitada y scroll fino; la paleta y las acciones permanecen debajo sin alargar la ventana por cada icono nuevo.

Icono y color se eligen en el mismo diálogo con vista previa. Seleccionar opciones no guarda: Aplicar confirma ambos; Cancelar o Escape descartan. Al crear, Aplicar sólo prepara el formulario y Crear categoría persiste ambos. Colores permitidos: automático, turquesa, azul, violeta, rosa, ámbar, verde y gris. La migración aditiva `20261016020000_category_colors` guarda Category.color con valor inicial auto. La API valida la paleta y registra icono/color juntos en la transacción de actualización; clientes antiguos que omiten color lo conservan.

La pantalla presenta dos paneles con creación, búsqueda local, edición y baja mediante las confirmaciones existentes. Los contadores vienen de PostgreSQL y cuentan todos los productos asociados del catálogo organizacional (incluidos archivados), no el stock ni sólo la sucursal elegida. No se muestran fechas de actualización de precios ni alertas inventadas.

Las categorías permiten elegir un icono al crear y cambiarlo desde el botón Icono de cada fila. La opción Automático conserva la referencia según el nombre. La selección explícita se guarda en PostgreSQL y se comparte entre equipos; no cambia identificadores ni reglas comerciales. Los laboratorios sin logo muestran iniciales y un acceso para subirlo.

La migración `20261016010000_category_icons` agrega Category.icon con valor inicial auto y restricción de opciones válidas. Crear admite icon; PATCH `categories/:itemId/icon` exige CATALOG_MANAGE y categoría activa de la organización, y registra cambio y auditoría en una transacción serializable. El selector gráfico usa un diálogo para no quedar recortado por el scroll del listado.

Las claves React de Categorías, Listas de precios y Organización son distintas incluso para la misma organización: compartirlas provocaba duplicación de paneles y pérdida de la edición al reconciliar. Los campos capturan el valor del evento antes de actualizar estado. Los errores de carga muestran Reintentar y no quedan como Cargando indefinido.

Los identificadores de iconos se exportan directamente desde la entrada de contracts. Este paquete expone TypeScript fuente y un reexport de valores con ruta relativa sin extensión fallaba al arrancar Node, aunque los tests transformados y TypeScript pasaran. La prueba category-icons-runtime arranca un proceso Node independiente para cubrir ese caso. Verificar también health y recuperación de sesión con el servidor iniciado.

Pulsar la miniatura de laboratorio abre el editor de fotos existente: elegir JPG/PNG/WebP, vista previa, reemplazar, quitar, deshacer, cancelar y guardar. Reutiliza la optimización a JPEG, máximo 60 KB y 1024 px por lado, y la validación de estructura del backend descrita en PRODUCTS.md. No se buscan logos externos ni se almacenan en localStorage.

GET/PATCH/DELETE `organizations/:organizationId/catalog/laboratories/:itemId/logo` requieren autenticación, pertenencia a organización y laboratorio activo. Lectura exige CATALOG_READ; guardar y quitar, CATALOG_MANAGE. Lectura privada sin caché; el listado sólo devuelve logoUpdatedAt, no bytes. Guardado y auditoría son una transacción serializable. No modifica nombres, precios, productos ni stock. No se guardan bytes en auditorías.

La migración aditiva `20261016000000_laboratory_logos` agrega logo (BYTEA nullable, con límite en base) y logoUpdatedAt. Las imágenes quedan compartidas entre equipos de la organización y dentro de sus respaldos PostgreSQL. Antes de desplegar el nuevo backend se debe aplicar la migración y regenerar Prisma. No ejecutar migraciones productivas desde el frontend.

## Categorías y laboratorios

Cada fila permite editar el nombre o eliminar mediante un diálogo de confirmación. Los errores se muestran dentro del diálogo y no descartan lo escrito. Las operaciones requieren `CATALOG_MANAGE` y verifican organización e identificador en el backend.

Eliminar es una baja lógica (`active=false`), sin borrar registros. Se bloquea si hay productos asociados, incluso inactivos; antes debe cambiarse su clasificación. Renombrar conserva el identificador y los vínculos. Los cambios y su auditoría se escriben en una transacción serializable. Los nombres duplicados se informan como conflicto y no se fusionan registros.

Las categorías iniciales solo se crean si la organización aún no tiene ninguna, incluyendo las archivadas en esta comprobación. No se recrean ni se reactivan automáticamente al entrar a Productos después de renombrarlas o eliminarlas. Los registros archivados conservan la reserva de su nombre dentro del mismo nivel.

Categorías y Laboratorios se administran en pestañas independientes. Categorías muestra un árbol desplegable; el botón + de cada fila prepara una nueva subcategoría. Crear dentro de permite elegir cualquier nivel y Editar categoría permite cambiar su superior, excluyendo la propia rama. Los selectores muestran la ruta completa para distinguir nombres iguales. Buscar encuentra descendientes aunque su rama esté cerrada. Las categorías existentes permanecen como raíces hasta reorganizarlas explícitamente; no se reasignan productos automáticamente. Confirmar una referencia externa ya no crea categorías: sólo reutiliza una coincidencia única existente.

No requiere migraciones. Implementado en local, sin alterar datos de producción.

## Códigos internos y etiquetas

Acceso: Productos → Nuevo/Editar producto → **Código interno**, arriba del formulario, con el mismo popup. Consultar/reimprimir exige CATALOG_READ; generar exige CATALOG_MANAGE. Generar marca una solicitud pendiente en el formulario: cerrar sólo el popup la conserva, pero cancelar el formulario la descarta. Guardar producto/Guardar cambios confirma el código junto con el alta o edición. No se imprime un código pendiente; los códigos ya guardados se pueden reimprimir y no se eliminan al cancelar una edición. Guardar primero cambios de nombre/unidad antes de imprimir.

La API ofrece GET `organizations/:organizationId/catalog/products/:productId/internal-barcode` para consultar. Se retiró el POST independiente: alta y edición reciben `generateInternalBarcode` opcional y generan dentro de su transacción, bajo bloqueo del producto, verificando pertenencia y actividad. Reutilizan el código existente o agregan un ProductBarcode secundario y auditoría PRODUCT_INTERNAL_BARCODE_CREATED. El identificador es estable (hash SHA-256 acotado, prefijo privado SG); una colisión con otro producto revierte el guardado completo, nunca se reasigna. La restricción única de base protege carreras. No requiere migraciones, no reemplaza el código principal ni convierte unidades de stock.

El editor carga exclusivamente el código principal en su campo editable para no sobrescribir accidentalmente un código interno secundario. Ventas e Inventario ya buscan en todos los códigos del producto.

JsBarcode genera Code 128 localmente sin servicios externos. Vista previa e impresión HTML/SVG aislada en iframe, textos escapados, de 1 a 210 copias. A4 vertical, margen 10 mm, etiquetas recortables de 62 × 36 mm, tres columnas y siete filas (21 por hoja). No corresponde a una plantilla comercial de papel autoadhesivo. Incluye nombre, unidad guardada y código legible, sin precio. El código no es EAN/GTIN ni reemplaza identificación sanitaria.

Imprimir al 100%, sin ajustar escala y sin encabezados/pies del navegador. Probar primero una etiqueta con el lector real. Las pruebas automáticas verifican generación estable, reutilización, permisos, aislamiento, colisión, escape HTML, Code 128 y paginado. La impresión física y lectura óptica requieren validación en el equipo del usuario. No se despliega producción automáticamente.
