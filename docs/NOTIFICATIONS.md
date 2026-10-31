# Campanita de alertas

Panel de lectura en la cabecera, a la izquierda de la cuenta. Corresponde exclusivamente a la organización y sucursal seleccionadas; al cambiar ese contexto se desmonta el panel anterior. Reutiliza las consultas autorizadas de catálogo por sucursal, inventario y vencimientos. Cada sección informa sus errores sin interpretar una consulta fallida como ausencia de alertas.

- Cuentas: sólo ventas con estado OVERDUE y pendiente positivo confirmado por el servidor; no se infiere deuda vencida para ventas sin fecha ni para asignaciones por revisar.
- Stock: suma del stock vendible informado por Inventario, sólo para productos activos. Sin stock y stock bajo comparten un aviso por producto. El mínimo general de aviso es 5 unidades inicialmente y puede modificarse en el panel para la sesión; no es una configuración de reposición persistida ni cambia reglas de venta.
- Lotes: con existencias positivas y estado EXPIRED o EXPIRING_SOON del servidor (90 días). No altera lotes ni disponibilidad.

El contador indica avisos sin leer. Abrir el panel marca los avisos disponibles como vistos y mantiene su contenido visible hasta cerrarlo; al volver a abrir no se repiten. Se conservan huellas de los avisos vistos en localStorage por usuario, organización y sucursal, sin nombres ni saldos. Un cambio en el contenido genera un aviso nuevo. El estado de lectura se mantiene en este navegador, no se sincroniza entre equipos; si el almacenamiento falla se conserva sólo en memoria. Las condiciones comerciales siguen visibles en sus módulos y no se borran de la base.

Se consulta al montar, abrir, regresar a la pestaña y cada minuto mientras está visible, sin consultas solapadas. Cambiar el filtro o mínimo no escribe datos comerciales. Cada aviso permite abrir Cuentas corrientes o Inventario; no ejecuta cobros ni ajustes.

El panel separa Nuevas e Historial. El historial conserva hasta seis versiones vistas, ordenadas por fecha de lectura, durante siete días exactos desde su primera lectura. A diferencia de las huellas de lectura, este registro guarda título, detalle, categoría y fecha (puede contener nombres y saldos) en localStorage bajo una clave separada por usuario/organización/sucursal. No se sincroniza entre equipos; no guarda credenciales. Los avisos indican que son históricos y su información puede haber cambiado. Reabrir no renueva su vencimiento. Los avisos anteriores a la incorporación del historial no se reconstruyen ni se fechan artificialmente.

La depuración se realiza al cargar, abrir y cada minuto con la aplicación montada. Con la aplicación cerrada, los registros vencidos se depuran en la próxima apertura; nunca se muestran vencidos. Eliminar del historial no elimina la huella de leído, por lo que un aviso sin cambios no reaparece como nuevo. Consultar Historial no marca avisos nuevos como vistos. Los filtros de categoría se aplican sobre los seis registros conservados, no crean cupos independientes.

No hay notificaciones push, correo, sonidos ni servicio en segundo plano con la aplicación cerrada. No se introdujeron migraciones ni infraestructura externa.
