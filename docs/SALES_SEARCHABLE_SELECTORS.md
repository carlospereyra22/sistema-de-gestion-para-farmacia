# Selectores con búsqueda en Ventas

Cliente y Lista de precios permiten escribir para filtrar nombres, sin distinguir mayúsculas ni tildes. Admiten flechas, Enter, clic y Escape. El desplegable abre hacia arriba para no quedar fuera del panel de búsqueda. Al salir sin elegir se conserva la selección anterior; escribir no cambia clientes, precios ni pagos.

Seleccionar aplica exactamente los callbacks anteriores: Cliente restablece la lista automática y limpia pagos; elegir lista limpia pagos. Público general conserva el valor vacío original. Lista de precios siempre muestra una lista real, en el mismo orden con el que cobra la API: la elegida en la venta, la asociada al cliente y, si no hay ninguna, Precio general. Elegir otro cliente vuelve a su lista. No se modifican permisos, catálogo, stock, cuentas ni reglas del servidor.

Cada venta nueva arranca en Público general y Precio general: la selección se limpia al confirmar, vaciar o descartar la venta, y al salir de la pantalla con el carrito vacío. Con productos cargados se conserva, porque es una venta en curso, y al volver se puede continuar o descartar.
