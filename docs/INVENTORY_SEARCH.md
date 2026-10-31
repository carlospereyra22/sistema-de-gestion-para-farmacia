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
