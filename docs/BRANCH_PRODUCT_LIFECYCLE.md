# Productos por sucursal

## Comportamiento

En Productos, los botones visibles **Activos / Archivados** cambian el listado y respetan los demás filtros de búsqueda. Gestionar muestra las acciones breves Archivar o Restaurar; Eliminar de esta sucursal sólo aparece para archivados. La confirmación se centra en pantalla y limita su altura para permitir desplazamiento en pantallas pequeñas.

Desde el 10/10/2026, Gestionar recupera las tres filas centradas del diseño anterior, con la acción destructiva separada en rojo. Para activos se ofrece nuevamente **Eliminar definitivamente**, sin archivo previo: sólo productos sin ventas, lotes (incluso en cero), compras, transferencias ni movimientos en ninguna sucursal. El diálogo aclara que afecta al catálogo compartido. La API bloquea el producto, verifica todo el historial y registra la eliminación con nombre y estados locales en auditoría antes de retirar precios, códigos y configuración local. No borra auditorías. Una migración adicional impide nuevas referencias a un producto eliminado durante una operación concurrente. Para archivados se mantiene la baja local con advertencia de stock.

- El catálogo maestro y los precios siguen perteneciendo a la organización. Un administrador con CATALOG_MANAGE y acceso a la sucursal puede archivar, restaurar o eliminar de esa sucursal, con motivo obligatorio.
- Sin un estado local, se conserva el comportamiento previo del producto global. No se cambian productos ni existencias al aplicar la migración.
- Archivar quita el producto de las opciones de venta/compra/transferencia de esa sucursal, conserva stock y permite restaurar desde el filtro Archivados. Las consultas de inventario siguen mostrando existencias archivadas para poder gestionarlas.
- Eliminar exige archivarlo primero. La confirmación identifica la sucursal y muestra el stock físico (también vencidos); exige aceptar expresamente la baja si es positivo. El servidor revalida la cantidad esperada. Compras y transferencias pendientes bloquean la eliminación.
- Eliminar oculta el producto del catálogo operativo de esa sucursal. Pone sus lotes en cero mediante ADJUSTMENT_OUT, uno por lote, y audita usuario, fecha, motivo y cantidad. No elimina lotes, ventas, renglones, pagos, compras, precios compartidos, códigos ni movimientos históricos. Las demás sucursales no cambian.
- No es borrado físico del producto maestro. No hay una acción de restauración cotidiana de eliminados. Si una anulación histórica de venta o distribución repone unidades, vuelve automáticamente a **Archivados**, con auditoría: ese stock no queda oculto ni se habilita su venta automáticamente. La devolución de cliente no repone stock vendible y conserva su flujo previo.
- Activar localmente no puede levantar una desactivación global antigua. Esa configuración general se conserva.

## Integridad y concurrencia

`ProductBranchState` tiene clave sucursal/producto y estado ACTIVE, ARCHIVED o DELETED. La API autoriza organización, membresía, rol y sucursal; no confía en la interfaz. La actualización, baja y auditoría comparten una transacción. Repetir el estado actual es inocuo; un estado esperado desactualizado se rechaza.

La migración añade validación de pertenencia y bloqueos sobre Product. Disparadores de PostgreSQL serializan cambios locales con escrituras físicas; impiden stock positivo en eliminados y nuevas líneas de venta, compra o transferencia para productos archivados/eliminados. Los servicios de compensación reabren el estado antes de reponer stock. Un conflicto concurrente o deadlock revierte la operación completa y solicita reintentar; no se reintenta una baja automáticamente.

La consulta `/catalog/products?branchId=…` comprueba acceso, excluye eliminados y expone el estado local y su fecha de actualización monotónica. La modificación exige esa versión esperada: una confirmación antigua no puede borrar stock repuesto después por una anulación. El diálogo invalida la aceptación de baja si cambia la cantidad mostrada. La consulta organizacional anterior y los precios compartidos conservan su alcance (Listas de precios utiliza ese catálogo compartido); los clientes viejos tampoco pueden eludir las protecciones de escritura de base. La desactivación global no se usa en Productos; la ruta global de eliminación se reserva a productos sin historial.

## Verificación y despliegue

Pruebas de integración con fixtures locales revertidos: aislamiento entre sucursales, archivo/restauración, conservación de ventas/pagos, baja de stock vencido, reintentos, permisos, confirmación, pendientes y defensas de base. Pruebas web para alcance de API y advertencia. No sustituye prueba visual interactiva ni una prueba con usuarios en producción.

Requiere desplegar primero la nueva migración y API y luego el frontend. No publicar el frontend solo. En esta tarea se aplica únicamente a la base local de desarrollo; no se archivan ni eliminan productos reales y no se despliega producción.

Verificado localmente el 09/10/2026: formato, lint, tipos, compilación de API/web, 333 pruebas API, 315 web y 18 de impresión. Incluye dos pruebas con conexiones independientes en un esquema temporal con datos sintéticos, eliminado al terminar. La migración 43 está aplicada sólo en gestion_dev. La app local volvió a iniciarse: API y base saludables, web HTTP 200. Sigue el aviso no bloqueante de Vite por tamaño de bundle. Pendiente revisión visual interactiva del diálogo y despliegue productivo coordinado; SUBIR-A-NETLIFY no se actualizó en esta tarea.
