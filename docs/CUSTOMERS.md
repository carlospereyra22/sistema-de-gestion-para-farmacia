# Clientes

El directorio ocupa todo el ancho disponible. Seleccionar una fila abre una ficha lateral; cerrarla recupera el ancho de la tabla. En pantallas pequeñas el detalle se coloca arriba del listado.

Incluye búsqueda por nombre, documento, teléfono, correo o referencia de ficha, filtro de lista de precios, clientes eliminados y paginación. La ficha es una referencia abreviada del identificador existente, no una numeración comercial nueva.

Alta y edición comparten un modal con datos principales, facturación, datos adicionales, contacto y observaciones opcionales de hasta 1000 caracteres. Las observaciones se validan en servidor y se guardan mediante las transacciones y auditoría existentes; vacío las elimina y omitir el campo las conserva. Requiere la migración `20261022010000_customer_notes`.

Se conservan los permisos PARTY_READ/PARTY_MANAGE, la prevención de documentos duplicados, la confirmación de homónimos y la baja lógica/restauración. No modifica saldos, condiciones de crédito ni datos fiscales históricos. Las notificaciones de éxito usan el aviso temporal inferior derecho.
