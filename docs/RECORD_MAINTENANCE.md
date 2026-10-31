# Gestión de cajas, cierres y correcciones de lote

## Uso

- Caja → Configurar cajas (junto a Nueva caja): abre un panel separado con acciones Editar, Eliminar y Restaurar. Cada acción tiene su propia confirmación; ya no se mezcla editar/eliminar ni se muestra una sección permanente debajo del historial. Primero debe cerrarse cualquier sesión abierta para eliminar una caja.
- Caja → Historial de cierres → Eliminar (papelera): sólo ADMIN, motivo obligatorio y archivo recuperable, nunca borrado físico. Ver cierres eliminados del listado permite restaurar, con motivo. Los filtros de fecha se aplican también a eliminados; sin fechas se consulta el período predeterminado de aproximadamente 30 días.
- Inventario → Editar (lápiz): comprobar el envase, corregir lote/vencimiento y registrar un motivo. Una fecha vacía significa sin vencimiento. No sirve para corregir cantidades ni costos; la cantidad se corrige mediante Ajustar, conservando el movimiento.

Todas las operaciones comprueban permisos y alcance de organización/sucursal en el servidor. Los cambios y la auditoría son transaccionales. Si otra PC cambió la caja o el lote, se rechaza la edición desactualizada. Los documentos fiscales y los importes comerciales no se reescriben.

## Desarrollo y publicación

Requiere la migración nueva `20261004150000_cash_archive_lot_metadata` y regenerar Prisma Client. Agrega `CashSession.archivedAt` (sólo sesiones cerradas) y `ProductLot.metadataVersion`. No elimina registros ni columnas. Actualizar API/base antes del frontend; no basta subir sólo el frontend a Netlify.

La migración se aplicó en la base local `gestion_dev`. Esta tarea no publica ni migra Oracle.

Pruebas automatizadas nuevas:

- `apps/api/test/record-maintenance.integration.spec.ts`: transacciones de PostgreSQL local que siempre se revierten; sin llamadas a ARCA ni emisión fiscal. Verifica permisos, aislamiento por sucursal, sesiones abiertas, archivo/restauración, preservación de saldos/movimientos, versión, fechas, duplicados y transferencias pendientes.
- `apps/web/src/record-maintenance.test.tsx`: controles visibles y contratos HTTP, alcance, motivo y concurrencia.

Prueba manual local: iniciar `Iniciar Gestion - Pruebas.cmd`, usar `http://localhost:5173` con la API y base locales, crear una caja de prueba, abrir/cerrar, archivar/restaurar el cierre, renombrar/desactivar/restaurar la caja. Recibir un producto de prueba y corregir lote/vencimiento; verificar que cantidad/costo no cambian. Probar también con un usuario no administrador. No usar la web publicada para estas pruebas ni cargar credenciales fiscales reales en el entorno local.

Pendiente de verificación manual: interacción completa en navegador y comportamiento visual con los datos del usuario. No se emiten facturas para comprobar este mantenimiento.
