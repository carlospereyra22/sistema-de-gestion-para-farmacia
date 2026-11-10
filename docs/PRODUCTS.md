# Productos: operación y mantenimiento

Categorías adaptables (29/10/2026): crear o editar una categoría funciona normalmente, sin popup de coincidencias ni configuración de términos. Al completar una ficha del catálogo interno por código, el servidor consulta el árbol vigente de la organización y adapta su clasificación a las categorías y subcategorías actuales. Usa nombre, presentación y clasificación explícita de la fuente, con equivalencias conocidas y contexto de los padres. Una subcategoría específica puede ganar sobre una categoría general cuando todos sus datos coinciden. Ante ambigüedad entre ramas queda para revisión manual. Renombrar, mover o desactivar categorías se refleja en la próxima carga. No mueve productos comerciales ya guardados ni reescribe las fichas originales de las fuentes.

Marca y tipo de producto (26/10/2026): Marca es independiente de Laboratorio, editable y autocompletable desde una ficha externa confirmada. Se muestra debajo del nombre, participa en la búsqueda y puede filtrarse desde Filtros adicionales, junto con Medicamentos/Otros productos. No se deduce una marca del laboratorio.

El interruptor Es medicamento está en el encabezado, junto al cierre. Un alta comienza en modo automático: prioriza el tipo guardado para el código; si no existe, una referencia exacta del catálogo no medicinal tiene prioridad sobre el padrón. Sin referencia no medicinal se consulta el padrón y una coincidencia exacta única puede completar y vincular el medicamento. Cambiar el interruptor fija una decisión manual durante ese formulario; ninguna respuesta tardía la reemplaza. Los productos normales ocultan Laboratorio y receta, conservan Marca y Presentación, y ofrecen Unidad / envase completo o Caja / pack completo sin nuevas conversiones de stock. Las unidades existentes se preservan al editar. En fichas existentes, desactivar Es medicamento y guardar quita la vinculación medicinal y la receta, conserva los datos descriptivos y el precio actual (incluido fraccionamiento), y audita el cambio. La migración mantiene el comportamiento de los productos previamente vinculados, con receta o categorizados como Medicamentos; la revisión de clasificaciones existentes es explícita.

Documento consolidado; conserva las decisiones de implementación de cada apartado. El catálogo externo y sus imágenes se documentan en [EXTERNAL_PRODUCT_CATALOG.md](EXTERNAL_PRODUCT_CATALOG.md).

## Encabezado de Productos

El título y la última actualización permanecen en la cabecera global. Los cuatro indicadores se muestran en una franja blanca dentro de Productos, encima del buscador, con separadores suaves, números de 26 px e iconos lineales sobre fondos circulares suaves. Una línea superior identifica cada indicador: rosa para sin stock, ámbar para stock bajo, violeta para por vencer y rojo para vencidos, también cuando su valor es cero. Nuevo producto aparece al lado de los indicadores. En anchos menores la acción pasa a otra fila y los indicadores se distribuyen en dos columnas en móvil. La tabla conserva su desplazamiento independiente.

SISTEMA-22: se quitaron Total y Activos (casi siempre coincidían y no indicaban nada que hacer). Cada indicador es un botón que filtra la tabla con el mismo criterio que cuenta: deja su filtro como único filtro de Stock/Vencimiento y vuelve a Activos; tocarlo de nuevo quita el filtro. El indicador elegido queda resaltado. Cálculos en `lib/product-catalog-metrics.ts`.

- Sin stock conserva el criterio de Productos: activos sin existencias físicas. Los lotes vencidos siguen siendo stock físico (por eso aparecen en Vencidos y no en Sin stock).
- Stock bajo usa el umbral confirmado por el usuario: activos con entre 1 y 5 unidades disponibles para vender, sumadas por producto. Excluye cero, archivados y existencias vencidas no vendibles. Es un indicador, no una nueva regla de compra o bloqueo. El filtro Stock tiene la opción Stock bajo con el mismo criterio.
- Por vencer y Vencidos: activos con algún lote con cantidad positiva próximo a vencer (90 días) o vencido; usan el mismo estado que el filtro Vencimiento.

## Estilo único de tablas

`src/data-table.tsx` define el estilo de tabla del sistema; Productos es la primera que lo usa y el resto se migra de a poco. Escala: 14 px para el dato principal y 12 px para encabezados (mayúsculas), líneas secundarias y estado; una sola tipografía, números de ancho parejo (`numeric`) e importes y cantidades alineados a la derecha. El estado se muestra con punto y texto (`StatusLabel`). La columna Acciones usa botones de ícono (`RowIconAction`, mismo estilo que Categorías y laboratorios): en Productos, editar (lápiz, verde azulado), archivar/restaurar (caja, gris) y eliminar (tacho, rosa), con tooltip y nombre accesible; archivar y eliminar abren el diálogo de confirmación existente. Reemplaza el menú Gestionar. En Productos el código de barras usa la misma letra que el resto; los códigos equivalentes se resumen en una segunda línea "↳ N importado(s)" con los códigos al pasar el mouse. Stock vendible total (con ícono de ayuda "Qué incluye", el mismo `ReportHelp` de Reportes, vía `hint` de la columna) va alineado a la izquierda, junto al lote (excepción a los números a la derecha, porque el título es largo), y muestra sólo unidades vendibles (rojo sin vendibles, ámbar si está bajo); las unidades vencidas no se suman y se ven debajo como "N vencidas". La columna Lote, antes de Stock vendible total, muestra el lote principal (el primero del orden de abajo, el mismo de Próx. venc. y Estado; "—" sin lotes) (`product-lot-cell.tsx`). Con un solo lote no hay nada que desplegar. Si hay más de uno, al lado aparece "+N ⌄"; tocarlo, o cualquier parte de la fila salvo la foto y los botones, despliega debajo el detalle (lote, vencimiento, unidades y estado: por vencer, disponible o vencido no vendible) (`DataTableRow onToggle`, `DataTableDetailRow`, `product-lots-detail.tsx`). Se pueden abrir varios a la vez.

- Orden del detalle: primero los próximos a vencer, después los normales (los sin fecha al final del grupo) y por último los vencidos; dentro de cada grupo, el que vence antes primero (`visibleProductLots` en `lib/product-lots.ts`).
- Muestra 5 lotes de entrada y "Ver N lotes más" para el resto.
- Cada lote es una sola fila: Total, cantidad de movimientos y último costo, que es el de la recepción más reciente. Un clic en la fila abre un bloque por proveedor: sus unidades y, separados por una línea, sus recepciones, ajustes y devoluciones con costo, de lo más nuevo a lo más viejo. Un proveedor que ya no tiene unidades aparece en 0 si tiene historial. Los ajustes anteriores a elegir proveedor figuran en Sin proveedor. Inventario conserva sus renglones a la vista. Ajustes y devoluciones llevan signo y muestran su motivo al pasar por el ícono; los ajustes pueden tener costo. Incluyen los registros anteriores a este cambio. Ambas listas no están relacionadas fila a fila. Un proveedor sin unidades no se muestra.
- Lotes históricos: la API de stock sólo devuelve lotes con unidades, así que los lotes agotados nunca aparecen en Productos; su historia queda en Inventario (movimientos).
- Buscar por lote (a la derecha del buscador principal): muestra sólo los productos con algún lote con unidades cuyo número coincide, ignorando mayúsculas, espacios, guiones y barras (`lotNumberMatches`). Sirve, por ejemplo, ante un retiro de lote de ANMAT o del laboratorio. La columna Lote muestra el lote que coincide; si coinciden varios, el detalle arranca abierto con ellos y el usuario puede cerrarlo. Limpiar filtros también lo vacía.
- Con un filtro de Vencimiento el detalle muestra sólo los lotes que lo cumplen, y avisa cuántos quedaron fuera; Lote y "+N" cuentan sólo esos lotes. Los demás filtros son del producto y no cambian los lotes.

Estado y Próx. venc. usan sólo lotes con unidades y siguen el mismo orden que el detalle (`byLotOrder`, `leadingLot` y `productStockStatus` en `lib/product-lots.ts`): manda el primer lote (por vencer, si no el normal que vence antes, y sólo si no queda otro, el vencido). Estado: Archivado, Sin stock, Vencido (todos los lotes vencidos), Por vencer, Stock bajo o Activo; si además hay lotes vencidos detrás del principal, debajo se lee "N lote(s) vencido(s)" en rojo. Con un filtro de Vencimiento o búsqueda por lote, Estado y Próx. venc. se calculan sólo con los lotes filtrados (con Vencidos, el estado es Vencido). Con Stock = Stock bajo el estado dice Stock bajo; Sin stock y Archivados ya muestran su estado. Los filtros que no son de stock (categoría, laboratorio, tipo, foto, código, precio automático) no cambian el estado. Próx. venc. muestra la fecha de ese primer lote, en rojo si está vencido y en ámbar si está por vencer; la fecha se muestra en UTC, igual que Inventario, para no correrse un mes.

- La búsqueda agrega laboratorio y comparación sin acentos a nombre/código.
- Vencimiento filtra por existencia de lotes con cantidad positiva: vencidos, próximos 30, 60 o 90 días (sin vencidos) o sin fecha. Usa el estado de disponibilidad existente de Inventario, no un criterio alternativo; 30 y 60 días acotan por fecha los lotes que Inventario ya marca como próximos a vencer.
- SISTEMA-22: no hay ventana de filtros aparte; los filtros están en la misma barra y se aplican al elegir. SISTEMA-25: para que la barra no ocupe tres filas, debajo del buscador se ven siempre los cinco principales (Categoría, Laboratorio, Estado, Stock y Vencimiento); Tipo, Precio automático, Foto y Código de barras se despliegan con "Más filtros", que está junto a Limpiar filtros, cuenta cuántos de esos cuatro están activos y arranca abierto si alguno lo está. Precio automático distingue los productos vinculados al padrón ("Se actualiza solo") de los de precio manual. Limpiar filtros vuelve a la vista inicial (búsqueda vacía, Activos, sin filtros), indica cuántos hay activos y está deshabilitado si no hay ninguno. Cambiar filtros restablece la página; Estado conserva acceso a Archivados. Estos filtros sólo consultan datos ya cargados, sin operaciones comerciales ni cambios de catálogo.
- Los filtros usan controles propios con toda la superficie clickeable, lista blanca del mismo ancho del filtro, bordes suaves, resaltado verde y marca de selección. Admiten flechas, Inicio/Fin, Enter/Espacio, búsqueda por letras, Escape, Tab y cierre al pulsar fuera; listas largas conservan desplazamiento por rueda, gesto y teclado con barra fina verde grisácea y pista suave para señalar que hay más opciones. El espacio de la barra se reserva para evitar saltos del contenido.
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

Productos ofrece un desplegable junto al botón Buscar para elegir Padrón oficial (predeterminado para productos nuevos), AlfaBeta o Precios de Remedios. Al editar, se selecciona la fuente del vínculo guardado. La búsqueda de la tabla sigue filtrando el catálogo propio. En el formulario se elige un medicamento y su presentación exacta; se guarda la fuente del resultado seleccionado, no la del selector de búsqueda, junto con nombre y presentación en los campos existentes. Cambiar de fuente para explorar no modifica el vínculo hasta elegir un resultado y guardar. No requiere migraciones. Vincular no cambia el nombre de un producto ya existente ni borra su código de barras cuando la fuente no lo informa. El padrón completa principio activo y otros datos cuando están disponibles. Desde el 02/11/2026 (SISTEMA-19) elegir una referencia carga todos los datos que informa la fuente: si el código de barras está vacío se copia el EAN de la referencia (también desde la búsqueda por nombre) y se asigna la categoría Medicamentos (o Medicamento, sin distinguir tildes ni mayúsculas). Ese código no se vuelve a consultar mientras se escribe, porque ya corresponde a la ficha vinculada. Elegir una referencia de la lista reemplaza todo el medicamento: si la fuente informa un EAN, reemplaza el código cargado (copiado, escaneado o escrito) y, si era distinto, avisa ambos códigos para cotejar el envase. Si la nueva referencia no informa EAN, se borra sólo el código copiado de la anterior. Los datos que traía la anterior y la nueva no informa (precio, principio activo, forma, concentración, receta) se limpian. El padrón público no informa POTENCIA: la concentración se toma de la dosis escrita en la presentación o el nombre ("500 mg", "100 mg/5 ml", "4%"), nunca del tamaño del envase ("x 30 g"); si no figura, queda vacía. La búsqueda se ejecuta sola 600 ms después de dejar de escribir (mínimo 3 caracteres) y al cambiar de fuente; Buscar y Enter siguen consultando en el momento. El conector de AlfaBeta aporta nombre, laboratorio, presentación y precio, sin inventar campos ausentes. No se mezclan automáticamente las fuentes.

Cuando Es medicamento está activado o el producto ya está identificado como medicinal, la consulta por código utiliza únicamente el buscador medicinal; no llama al catálogo externo no medicinal. En modo automático sin tipo conocido, se consulta el catálogo no medicinal para clasificar el código y, si no hay coincidencia, el padrón medicinal.

La tarea de la API corre a las 09:00 y 17:00 de Argentina (12:00 y 20:00 UTC). Requiere la API encendida; no es un cron del sistema operativo y no recupera horarios perdidos durante una caída. El botón de actualización usa el mismo servicio.

## Buscador del formulario de producto — SISTEMA-21

- **Un solo buscador arriba ("Buscar producto")**, siempre visible, para nombre o código (escrito o escaneado con el lector). Con 13 o 14 dígitos busca solo; 8 o 12, con Enter. Debajo explica dónde busca: por código, catálogo propio + padrón oficial + catálogo de perfumería; por nombre, catálogo propio + la fuente elegida en el selector.
- **El campo Código de barras de Datos del producto es sólo el dato guardado**: se corrige a mano y nunca busca ni cambia de producto.
- **Resultados en un desplegable** que no empuja el formulario: primero "En tu catálogo" y después la fuente externa. Elegir cualquier resultado cierra todo el desplegable.
- **Código o producto propio:** se abre para modificarlo con sus datos (y, si es medicamento vinculado, se precarga la presentación del padrón). **Resultado externo:** empieza un producto nuevo limpio (foto incluida), sin avisos de reemplazo. Sólo al editar un producto abierto desde la lista, elegir otra referencia cambia su vinculación y avisa si cambia el código.
- **Envase importado:** si el código no aparece y es medicamento, "¿Es importado? Asociarlo a un medicamento nacional" muestra el panel `importado → nacional` y se busca el nacional por nombre o código. Si el nacional ya está en el catálogo se abre ese producto con el código como "pendiente" en Códigos equivalentes y se guarda con "Guardar y asociar código"; si no, se crea con los dos códigos al guardar. Nada se asocia sin apretar el botón.
- **Códigos equivalentes en productos nuevos:** se cargan como pendientes y se envían con el alta en la misma transacción.
- Los campos del formulario usan `!text-sm` porque la regla global `input { font: inherit }` de `index.css` pisa las utilidades de tamaño de Tailwind.

## Copia local del padrón y actualización para todas las farmacias — SISTEMA-21

Desde SISTEMA-26 la corrida toma los precios de la base de medicamentos y Remedios y AlfaBeta se leen por link guardado; lo de abajo sigue vigente para lo que no está en esa base. Ver `MEDICINE_CATALOG.md`.

Antes cada producto vinculado de cada farmacia buscaba su precio por nombre en el padrón, en serie y sin caché (hasta ~588 consultas por corrida con 155 productos). Ahora:

- **Una sola descarga por corrida para todo el sistema.** La corrida de las 09:00 y 17:00 baja el padrón completo (`%%%`, ~16.000 presentaciones vigentes, ~16 MB) y reemplaza la copia local `MedicineReferenceSnapshot`, compartida por todas las organizaciones porque es información pública. Medido en local: 155 productos en ~10 s, de los cuales ~8 s son la descarga.
- **Aplicación sin trabar ventas.** Cada farmacia se compara en memoria contra la copia. Los productos sin cambios no abren transacción (sólo se marca la fecha de revisión en un `UPDATE` por lote); los que cambian usan la misma transacción corta de siempre, con bloqueo del producto, revalidación del vínculo y auditoría.
- **Precios de Remedios y AlfaBeta** no se pueden descargar completos: se busca una vez por medicamento distinto en toda la corrida (aunque lo tengan muchas farmacias), de a 2 búsquedas simultáneas, y el resultado se guarda en la copia local.
- **Botón de una farmacia:** aplica la copia local sin descargar el padrón. Para las otras fuentes usa lo guardado y sólo sale a internet si ese medicamento nunca se consultó.
- **Búsqueda y escaneo** del formulario consultan la copia local mientras tenga menos de 36 horas: responden sin internet y siguen funcionando con el padrón caído. Sin copia reciente vuelven a la fuente externa.
- **Protección:** si el padrón no responde se conserva la copia anterior; si devuelve menos del 60 % de las filas de la copia vigente se aborta la corrida sin tocar copia ni precios.
- **Una corrida global a la vez**, aunque haya varias instancias de la API (índice único parcial sobre `PriceRefreshRun` en estado RUNNING). Una corrida colgada más de 2 horas se cierra como FAILED.
- **Registro:** cada corrida queda en `PriceRefreshRun` (disparador, estado, filas descargadas, revisados, cambiados, errores) y cada precio cambiado en `PriceRefreshChange` con el antes y el después. La auditoría de cada cambio incluye el `runId`.

### Comando de servidor

Se corre en el VPS (o en local) con la API compilada:

```
pnpm --filter @gestion/api precios estado            # últimas 10 corridas y si hay pausa
pnpm --filter @gestion/api precios sincronizar       # descarga y aplica a todas las farmacias ya
pnpm --filter @gestion/api precios deshacer <idCorrida>
pnpm --filter @gestion/api precios pausar | reanudar
```

- **Deshacer** restaura precio de venta y referencia de cada producto que cambió esa corrida, salvo los modificados después (a mano o por otra corrida): esos se informan y no se tocan. Si la fuente sigue mal, conviene pausar antes de deshacer para que la próxima corrida no lo vuelva a aplicar.
- **Pausar** sigue descargando el padrón (la búsqueda queda al día) pero no cambia precios hasta reanudar. Se guarda en `PlatformSetting`.
- El rol de administrador de plataforma (para hacer esto desde una pantalla) queda para otra tarea.

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

Categorías y Laboratorios se administran en pestañas independientes. Categorías muestra un árbol desplegable; el botón + de cada fila prepara una nueva subcategoría. Crear dentro de permite elegir cualquier nivel y Editar categoría permite cambiar su superior, excluyendo la propia rama. Los selectores muestran la ruta completa para distinguir nombres iguales. Buscar encuentra descendientes aunque su rama esté cerrada. Las categorías existentes permanecen como raíces hasta reorganizarlas explícitamente; no se reasignan productos automáticamente. Confirmar una referencia externa ya no crea categorías: sólo reutiliza una coincidencia única existente. Cada categoría muestra sus productos sumando los de todas sus subcategorías (SISTEMA-83): si "falopa" no tiene productos propios y su subcategoría "test" tiene 1, las dos dicen 1; un producto nuevo directo en "falopa" la lleva a 2 y "test" sigue en 1. El total se calcula en la web con los conteos de la lista ya cargada, así que funciona igual sin conexión. Al elegir una categoría en Crear dentro de, el título pasa a "Nueva subcategoría" con la ruta de la madre.

No requiere migraciones. Implementado en local, sin alterar datos de producción.

## Códigos internos y etiquetas

Acceso: Productos → Nuevo/Editar producto → **Código interno**, arriba del formulario, con el mismo popup. Consultar/reimprimir exige CATALOG_READ; generar exige CATALOG_MANAGE. Generar marca una solicitud pendiente en el formulario: cerrar sólo el popup la conserva, pero cancelar el formulario la descarta. Guardar producto/Guardar cambios confirma el código junto con el alta o edición. No se imprime un código pendiente; los códigos ya guardados se pueden reimprimir y no se eliminan al cancelar una edición. Guardar primero cambios de nombre/unidad antes de imprimir.

La API ofrece GET `organizations/:organizationId/catalog/products/:productId/internal-barcode` para consultar. Se retiró el POST independiente: alta y edición reciben `generateInternalBarcode` opcional y generan dentro de su transacción, bajo bloqueo del producto, verificando pertenencia y actividad. Reutilizan el código existente o agregan un ProductBarcode secundario y auditoría PRODUCT_INTERNAL_BARCODE_CREATED. El identificador es estable (hash SHA-256 acotado, prefijo privado SG); una colisión con otro producto revierte el guardado completo, nunca se reasigna. La restricción única de base protege carreras. No requiere migraciones, no reemplaza el código principal ni convierte unidades de stock.

El editor carga exclusivamente el código principal en su campo editable para no sobrescribir accidentalmente un código interno secundario. Ventas e Inventario ya buscan en todos los códigos del producto.

## Códigos equivalentes (envases importados) — SISTEMA-20

Las droguerías a veces entregan un medicamento importado idéntico al nacional pero con otro EAN, que el padrón nacional no conoce. Ese EAN se guarda como código equivalente (`kind = EQUIVALENT`) del producto nacional: al escanearlo en Ventas, Inventario, Transferencias o Distribución se usa el mismo producto, con su stock, lotes y precio.

- Nuevo producto: si el código escaneado no se encuentra, el botón "Es importado: asociarlo a un medicamento nacional" lo reserva como equivalente, vacía el código principal y abre Vincular medicamento. Al elegir el nacional se copia su EAN como principal y, al guardar, el producto se crea con el equivalente en la misma transacción. Si el nacional ya está en el catálogo, se ofrece "Asociar el código a ese producto" y no se crea un duplicado.
- Editar producto: la lista "Códigos equivalentes (envases importados)" agrega y quita códigos al instante, sin esperar Guardar.
- API: `POST organizations/:organizationId/catalog/products/:productId/equivalent-barcodes` (`{ code }`) y `DELETE .../equivalent-barcodes/:code`; el alta acepta `equivalentBarcodes` (hasta 10). Requiere CATALOG_MANAGE, bloquea el producto, valida GTIN y audita PRODUCT_EQUIVALENT_BARCODE_ADDED/REMOVED. Quitar sólo afecta equivalentes, nunca el principal ni el SG.
- Un código identifica un solo producto dentro de la organización (otra organización puede usarlo). Un GTIN cuenta igual con o sin ceros a la izquierda. Si el código ya pertenece a otro producto se rechaza indicando cuál.

JsBarcode genera Code 128 localmente sin servicios externos. Vista previa e impresión HTML/SVG aislada en iframe, textos escapados, de 1 a 210 copias. A4 vertical, margen 10 mm, etiquetas recortables de 62 × 36 mm, tres columnas y siete filas (21 por hoja). No corresponde a una plantilla comercial de papel autoadhesivo. Incluye nombre, unidad guardada y código legible, sin precio. El código no es EAN/GTIN ni reemplaza identificación sanitaria.

Imprimir al 100%, sin ajustar escala y sin encabezados/pies del navegador. Probar primero una etiqueta con el lector real. Las pruebas automáticas verifican generación estable, reutilización, permisos, aislamiento, colisión, escape HTML, Code 128 y paginado. La impresión física y lectura óptica requieren validación en el equipo del usuario. No se despliega producción automáticamente.
