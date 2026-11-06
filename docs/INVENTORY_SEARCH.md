# Búsqueda en Inventario

El listado de existencias de la sucursal tiene búsqueda por nombre, laboratorio, presentación, concentración, principio activo, forma farmacéutica, códigos (incluidos secundarios) y número de lote. Normaliza mayúsculas/acentos y combina palabras en cualquier orden. Muestra cantidad de lotes encontrados y estado vacío. No cambia cantidades, vencimientos ni disponibilidad: mantiene visibles los vencidos cuando coinciden.

Recibir, Ajustar y Devolver usan un selector compacto con búsqueda en lugar del desplegable nativo de productos/lotes. Cada resultado distingue nombre, laboratorio, presentación y unidad; los lotes agregan número, cantidad física y vencimiento. La selección mantiene los identificadores originales, no fusiona nombres iguales ni adivina laboratorios ausentes. La ficha elegida conserva el laboratorio a la vista.

Máximo 30 resultados visibles, aviso para precisar, altura limitada con desplazamiento interno y apertura hacia arriba cuando falta espacio abajo. Flechas/Enter seleccionan y Escape cierra. Enter sin navegar sólo selecciona una coincidencia única; nunca escoge silenciosamente el primer medicamento de varios laboratorios. Un texto libre sin selección no cumple la validación del formulario. Se mantiene el escáner existente y el foco al siguiente campo en recepción/ajuste.

El buscador del listado y los selectores son independientes: filtrar existencias no altera formularios ni registros. Usa los datos ya autorizados/cargados por sucursal y organización, sin nuevos endpoints, migraciones o cambios en reglas de stock. No modifica la búsqueda en Ventas ni Distribución. Las pruebas cubren homónimos, acentos, códigos secundarios, lotes vencidos, resultados ambiguos y accesibilidad del selector.

Verificado el 10/10/2026: 325 pruebas web, lint, tipos, formato y compilación; persiste el aviso no bloqueante de tamaño del bundle. Inspección visual del selector abierto con Edge headless, CSS real y 35 productos sintéticos de laboratorios diferentes (captura local en `.cache/inventory-search-preview.png`); la página temporal de prueba se retiró. Pendiente prueba integral en la pantalla de Inventario con usuario y escáner físico. No publicado en producción.

## Presentación compacta de existencias

El listado muestra 10 lotes por página usando el mismo componente de paginación que Listas de precios. El contador dice «lotes», porque un producto puede tener varios. Primero busca en todas las existencias de la sucursal y luego pagina las coincidencias; escribir o limpiar la búsqueda vuelve a la primera página. Si una actualización reduce los resultados, limita la página a la última disponible. Los selectores de recepción, ajuste y devolución siguen usando todos sus productos/lotes. Cambiar de sucursal reinicia la vista, incluida la paginación.

El listado usa una tabla con producto/laboratorio/presentación, lote, vencimiento, stock y edición por ícono con nombre accesible. Las filas habituales ocupan aproximadamente 60 px; los nombres largos pueden envolver sin perder información. Se conservan las alertas de vencimiento y las cantidades físicas. La cantidad vendible sólo se repite cuando difiere del stock físico. El buscador y el contador comparten una fila. En espacios menores al ancho mínimo de la tabla, el desplazamiento horizontal queda dentro del listado, sin expandir la página.

Es un cambio de presentación: no modifica disponibilidad, cantidades, historial, permisos ni el formulario de corrección de lotes. La edición compacta es opcional y los demás usos conservan su botón con texto.

Verificación del cambio visual (10/10/2026): 328 pruebas web aprobadas, lint, tipos y build correctos. Inspección visual con Edge headless y CSS real en 1920, 1366 y 1100 px, usando productos/lotes sintéticos (capturas `.cache/inventory-table-*.png`); se retiró la página temporal. No se realizó una prueba integral autenticada ni con escáner físico. Backend sin cambios. No publicado en producción; continúa el aviso no bloqueante de tamaño del bundle.

## Vista por producto (SISTEMA-31, 05/11/2026)

Reemplaza la lista plana de lotes descripta arriba: lo anterior sobre búsqueda en el listado, paginación de lotes y tabla por lote queda como historial. Los selectores de Recibir, Ajustar y Devolver no cambian.

- **Una fila por producto**, con lotes, stock físico, vendibles, próximo vencimiento y estado. Reutiliza los criterios de Productos (`productStockStatus`, `byLotOrder`, `catalogStockTone`), así que las dos pantallas informan lo mismo.
- **Lotes desplegables**: tocar la fila abre sus lotes (`ProductLotsDetail`) con editar, Ajustar y Devolver. Ajustar y Devolver abren el formulario de la derecha con el lote elegido; no registran nada por sí solos.
- **Tarjetas** Sin stock, Stock bajo, Por vencer y Vencidos, iguales a las de Productos: tocarlas filtra y tocarlas de nuevo quita el filtro. También están los desplegables Stock y Vencimiento.
- **Dos buscadores**: el principal busca por nombre, código de barras, laboratorio, presentación, principio activo y forma farmacéutica; "Buscar por lote..." busca sólo el número de lote, ignora mayúsculas, espacios y guiones, y abre el producto con ese lote. El buscador principal ya no encuentra números de lote.
- **Qué se lista**: los productos activos de la sucursal y cualquier producto con unidades, aunque esté archivado o no figure en el catálogo cargado. Las tarjetas cuentan ese mismo conjunto, por lo que pueden diferir de Productos si hay archivados con stock.
- **Vencimiento y lote**: muestran sólo los lotes que cumplen y avisan cuántos quedan ocultos. El stock y los vendibles de la fila siguen siendo los totales del producto.
- **Orden**: próximos a vencer, normales, vencidos y al final los productos sin stock. Se pagina de a 10 productos; cambiar un filtro vuelve a la página 1.
- Un producto con todas sus unidades vencidas no cuenta como Sin stock (tiene stock físico) ni como Stock bajo (0 vendibles): aparece en Vencidos, igual que en Productos.

- **Número de lote en Recibir**: sugiere los lotes con unidades del producto elegido y siempre acepta uno nuevo. Elegir uno existente precarga su costo y vencimiento, porque la API los reemplaza con lo que se envía; un aviso indica que las unidades se suman a ese lote. Escribir el número exacto de un lote existente muestra el mismo aviso, pero no precarga nada. Los lotes agotados no se sugieren: la API no los devuelve.
- **Formularios de Recibir, Ajustar y Devolver**: comparten escáner y botones, y usan una sola distancia entre campos. Los avisos de escaneo, producto y lote ocupan una línea dentro de ese espacio, para que el formulario no cambie de alto; el texto completo queda en el `title`. El aviso de compras pendientes va debajo de los botones porque su alto varía.
- **Proveedor en Recibir y Devolver**: Recibir exige elegir un proveedor o Sin proveedor y lo conserva entre productos de la misma entrega; **Limpiar** también lo vacía. Devolver ofrece solo los proveedores del lote elegido y completa el proveedor si es uno solo. El detalle de lotes muestra un único origen debajo del número de lote; con varios, un renglón por proveedor y otro Sin proveedor, con sus unidades y sus botones Ajustar y Devolver, que precargan ese proveedor. Un proveedor sin unidades no se muestra.
- **Proveedor en Ajustar**: el formulario pide de qué proveedor son las unidades y lo completa si el lote tiene un solo origen. Restar ofrece quienes tienen unidades en el lote; sumar, Sin proveedor y todos los proveedores activos. Al sumar, el formulario ofrece Sin costo, Último costo u Otro costo, y un cartel muestra el último costo asociado.
- **Recibir desde un lote**: el botón Recibir de un lote o de un proveedor abre el formulario con producto, proveedor, número, costo y vencimiento precargados. Con varios orígenes, los botones están en cada renglón.
- **Costo unitario en Recibir**: usa `MoneyInput`, con el bloque `$`, miles con punto y centavos con coma. El `0,00` es solo referencia: el campo sigue siendo obligatorio. El botón **Limpiar**, presente en las tres pestañas, vacía el formulario y vuelve al escáner.
- **Ajustar y Devolver**: reemplazan el campo único "Producto y lote" por dos campos, Producto y Lote. Producto lista sólo los que tienen unidades; Lote se habilita al elegirlo y muestra sus lotes con unidades, vencimiento y si está vencido. Con un solo lote queda elegido. Lo mismo pasa al escanear. El selector de producto ya no busca por número de lote: para eso está el buscador por lote de la tabla, con sus atajos.

- **Escáner sin Enter**: en Recibir, Ajustar y Devolver el código se procesa solo 250 ms después del último carácter, si coincide con un producto. Si no coincide y tiene 8 caracteres o más, avisa "No encontramos..." al segundo. Enter sigue funcionando y procesa al instante. La pausa se reinicia con cada carácter, para que un código que empieza como otro más corto no elija el producto equivocado.

Es un cambio de presentación: no modifica API, base, stock, disponibilidad, permisos ni historial. La API sigue devolviendo sólo lotes con unidades; Sin stock se arma cruzando con el catálogo.
