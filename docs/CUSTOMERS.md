# Clientes

El directorio ocupa todo el ancho disponible. Seleccionar una fila abre una ficha lateral; cerrarla recupera el ancho de la tabla. En pantallas pequeñas el detalle se coloca arriba del listado.

Incluye búsqueda por nombre, documento, teléfono, correo o referencia de ficha, filtro de lista de precios, clientes eliminados y paginación. La ficha es una referencia abreviada del identificador existente, no una numeración comercial nueva.

Alta y edición comparten un modal con datos principales, facturación, datos adicionales, contacto y observaciones opcionales de hasta 1000 caracteres. Las observaciones se validan en servidor y se guardan mediante las transacciones y auditoría existentes; vacío las elimina y omitir el campo las conserva. Requiere la migración `20261022010000_customer_notes`. El alta también está disponible desde Cuentas corrientes con el mismo modal; ver `ACCOUNT_DUE_DATES.md`.

El teléfono se carga con un selector de país (+54 por defecto, con "Otro país" para cualquier otro código) y el número aparte; se guarda en un solo campo con el código, por ejemplo `+54 9 376 412-3456`, que es lo que necesita el enlace de WhatsApp. Un número pegado con `+` elige el país solo. Los teléfonos cargados sin código se muestran como Argentina y se guardan con +54 al guardar la ficha. Lo mismo vale para Proveedores. La lógica está en `apps/web/src/lib/phone-number.ts`; no cambia la API ni la base.

Se conservan los permisos PARTY_READ/PARTY_MANAGE, la prevención de documentos duplicados, la confirmación de homónimos y la baja lógica/restauración. No modifica saldos, condiciones de crédito ni datos fiscales históricos. Las notificaciones de éxito usan el aviso temporal inferior derecho.
