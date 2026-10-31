# Historiales operativos

Compras, Transferencias e Inventario tienen un botón Historial junto a la sucursal. Abre una ventana de consulta, sin reemplazar ni desmontar los formularios operativos. Cierra con la cruz, Escape o clic afuera. Cambiar de sección/sucursal crea una consulta independiente y descarta respuestas de consultas anteriores.

Se ofrecen búsqueda textual, fechas inclusivas en Argentina, estado/tipo y paginación visual de 20 registros. Se reutilizan las consultas de compras/transferencias; Inventario incorpora GET `organizations/:organizationId/branches/:branchId/inventory/history` con JWT, acceso a sucursal e `INVENTORY_READ`. Todas las lecturas se limitan a organización/sucursal; no hay escrituras ni migraciones.

Inventario incluye recepciones (directas y de compra), ajustes de ingreso/egreso y devoluciones a proveedor, incluso lotes vacíos. No mezcla ventas ni transferencias, y conserva el signo del movimiento. Compras muestra fecha de creación, proveedor, estado actual, total pedido y cantidades recibidas/pedidas. Transferencias muestra fecha de creación, origen/destino, estado actual y cantidades. Los detalles se despliegan por registro; no representan una línea de tiempo de todos los cambios de estado ni incluyen motivos que solo estén guardados en auditoría.

La paginación y los filtros son en memoria sobre las consultas completas, como las listas operativas existentes. Si crece el volumen debe incorporarse paginación/filtros de servidor en los tres módulos. Los nombres de productos/proveedores/sucursales son los actuales, no instantáneas históricas. Los errores no se presentan como historial vacío y permiten reintentar.
