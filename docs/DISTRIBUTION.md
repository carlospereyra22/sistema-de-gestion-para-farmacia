# Distribución externa

Acceso: **Inventario → Distribuir**, junto al historial y selector de sucursal. La pantalla permite escaneo o búsqueda por nombre, cantidad por teclado y selección de lote (sugerido por vencimiento, sin sustituir la selección física). Se agregan hasta 200 lotes, se pueden editar cantidades o descartar el borrador, y se confirma toda la lista con destino y motivo.

No genera venta, factura, deuda, caja ni cobro. El comprobante imprimible es interno, no fiscal. No reemplaza la gestión comercial de la distribución que se realiza por separado.

El botón «Historial» está en la cabecera de la ventana y abre una vista separada; «Volver a la salida» conserva destino, motivo y artículos del borrador. Al registrar una salida se permanece en la carga con confirmación visible y un borrador nuevo. El historial sólo se abre a pedido. Se retiraron el contador, la explicación del guardado y el botón de descarte del pie para simplificar la ventana; la persistencia automática del borrador sigue activa.

El buscador muestra coincidencias en un desplegable superpuesto con altura limitada, sin desplazar lote/cantidad ni la lista preparada. Permite flechas y Enter, cierra con Escape o al salir del control y se cierra al elegir un producto. La selección queda identificada antes del lote; editar la búsqueda limpia la selección anterior para evitar agregar otro medicamento por error. Seleccionar lleva el foco a cantidad, y Agregar lo devuelve al escáner.

## Implementación

### Importación PDF y preparación del borrador

En desarrollo, Vite preoptimiza `pdfjs-dist` y `tesseract.js` al iniciar. Esto evita que la primera selección de archivo provoque una recarga por descubrimiento tardío de dependencias y cierre la revisión en memoria. El código del lector sigue cargándose bajo demanda.

«Importar PDF» normaliza espacios en concentraciones y packs (por ejemplo `400x20` y `400 x20`), sin sustituir concentraciones ni presentaciones distintas. Asigna coincidencias exactas únicas y asociaciones confirmadas anteriores. La unidad general de pedido y la declaración física general del stock se eligen una vez; las excepciones se cambian por fila. Una confirmación general sustituye los checks por artículo. Hay filtro de pendientes, edición de nombres/cantidades y agregado/eliminación de filas OCR.

El total de cantidades se contrasta con el total del encabezado del pedido. Sin total reconocido, con totales contradictorios o diferencia, se bloquea exportar/preparar. El lector reintenta a 1800, 2200 y 1600 píxeles de lado mayor hasta conciliar; no inventa cantidades ni fusiona resultados contradictorios. Un total coincidente no demuestra exactitud de nombres o dosis: revisar presentaciones. En prueba local del PDF suministrado, PDF.js + OCR a 2200 recuperó 63 filas y 729 cantidades; hubo errores de texto que siguen requiriendo revisión.

Una vez confirmado se exportan faltantes y se pueden cargar disponibles al borrador, conservando lo ya cargado y respetando 200 lotes. No descuenta stock hasta confirmar la salida normal. El plan asigna vendibles por vencimiento y descuenta reservas del borrador. Filas ambiguas, repetidas o con unidades desconocidas/distintas/mixtas se excluyen explícitamente; no convierte cajas a blísteres. Exportar faltantes antes de cargar: al pasar al borrador se limpia la revisión para evitar agregarla dos veces. Declarar la unidad no regulariza registros físicos.

Al exportar o preparar después de confirmar se guardan asociaciones y unidades PEDIDAS en localStorage, por usuario/organización/sucursal. Sólo se reutilizan con producto activo y mismo nombre. No se guarda una equivalencia de unidades ni la declaración física del stock, y las preferencias no se comparten entre equipos. La revisión del pedido permanece en memoria hasta recargar.

La revisión queda en memoria mientras el componente esté montado, no se conserva al recargar. Límites: 15 MB, 10 páginas, 250 filas detectadas y 180 segundos. PDF.js y Tesseract se cargan al elegir archivo; el documento no se sube. El motor y el idioma OCR requieren descargas de internet. Se probó OCR AUTO con PDF.js y canvas local sobre las dos páginas del PDF suministrado. No se verificó todavía la interacción completa en navegador.

- `DistributionDispatch` y sus artículos guardan el documento e instantáneas; movimientos `ADJUSTMENT_OUT` con `referenceType=DISTRIBUTION` se muestran como Salida por distribución.
- El backend exige INVENTORY_MANAGE para crear/revertir, INVENTORY_READ para listar, y mantiene los guards de autenticación y sucursal.
- Bloqueo transaccional de solicitud, clave única por organización/sucursal/requestId y hash normalizado evitan repetir una salida. Bloqueos de lote en orden y actualización condicional protegen el stock. La validación, documento, movimientos y auditoría se confirman juntos.
- Una reversión requiere confirmación explícita de que la mercadería **no salió físicamente**. Sólo corrige un error de carga; conserva documento, motivo y movimientos de reposición. No implementa devoluciones reales de mercadería ya distribuida.
- Un resultado de red/servidor incierto conserva el UUID y congela la edición hasta reintentar la misma solicitud. Un rechazo de validación permite corregir. Fallas de autenticación no descartan la solicitud pendiente.
- El borrador es local a la pestaña mediante sessionStorage, por usuario, organización y sucursal. No se guardan credenciales. No es un respaldo ni se comparte entre equipos.
- Migración nueva `20261005010000_distribution_dispatch`, aplicada únicamente a `gestion_dev` local. Incluye restricción no negativa en lotes para futuras escrituras; no reescribe ni elimina stock histórico.

## Verificación

Pruebas unitarias de permisos, validación, idempotencia, lote vencido, stock insuficiente y reversión. `node scripts/test-distribution-local.cjs` usa PostgreSQL local y fixtures propios: verifica reintento concurrente, rollback completo, agotamiento concurrente del stock, reversión única y restricción negativa. El script elimina únicamente sus fixtures de una organización nueva; no utiliza registros comerciales existentes.

Requiere compilar API antes del script y migraciones aplicadas. La revisión visual, escáner físico e impresión real quedan pendientes en navegador. Producción no se despliega ni migra automáticamente.
