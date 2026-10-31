# Vista compacta del buscador

Revisión local: todos los resultados comienzan cerrados, incluso los dos AlfaBeta precargados y los grupos de una sola presentación. La precarga no controla la apertura del acordeón. Al abrirlo, las presentaciones comparten un encabezado de precio de referencia en ARS; presentación, importe y fecha se alinean en columnas que ocupan todo el ancho del bloque, con precio y fecha a la derecha. En móvil se apilan con la fecha etiquetada. Se conservan las fechas individuales, los precios faltantes y los textos originales de la fuente. Pendiente validación visual manual en navegador.

Prueba visual local del 04/10/2026: Dashboard muestra resultados en una sola columna, sin icono repetido de medicamento, con presentaciones debajo de su nombre y precios de referencia alineados a la derecha en escritorio. En móvil cada presentación y precio se apilan. La fuente y la fecha se conservan; en fuentes alternativas los datos técnicos quedan en Más información.

No se modificaron consultas, precios ni reglas de vinculación. AlfaBeta conserva carga diferida, errores y reintento; no se disparan consultas nuevas por todos los resultados. El componente compartido sólo activa el diseño compacto desde Dashboard; Productos conserva su diseño anterior.

La versión anterior de los dos componentes y sus tests está en `.cache/ui-backups/medicine-search-before-compact-20261004`. Para revertir, comparar/restaurar únicamente estos cambios visuales, preservando cambios posteriores. No requiere cambios de base ni de producción.
