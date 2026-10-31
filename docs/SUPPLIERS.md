# Proveedores

## Baja recuperable (23/10/2026)

Navegación: la vista visitada se conserva en memoria dentro de WorkspaceShell, limitada a la organización y sesión actuales. Al volver se revalida el listado en segundo plano sin vaciar filas ni mostrar otra carga; conserva búsqueda, filtros y página. No persiste contactos en almacenamiento del navegador. La primera carga muestra un esqueleto estático. Eliminados se ubica en la cabecera secundaria de la tabla y las acciones se centran.

Eliminar da de baja lógica al proveedor (`active=false`); Eliminados permite restaurarlo. Ambas acciones requieren PARTY_MANAGE y guardan auditoría en una transacción con bloqueo de la ficha. No borran compras, recepciones, deudas ni pagos, ni cancelan obligaciones pendientes. No se ofrece para nuevas compras, pero se conserva el acceso al historial. Esta decisión reemplaza la ausencia de baja descrita en el alcance inicial más abajo.

La ficha organizacional admite nombre, teléfono, correo, persona de contacto, dirección y observaciones. Los datos de contacto son opcionales; los proveedores existentes se conservan con esos campos vacíos. La migración aditiva `20261022000000_supplier_profile` no modifica condiciones, compras ni deudas anteriores.

PARTY_READ protege la consulta y PARTY_MANAGE el alta y la edición. El servidor valida longitudes y correo, normaliza espacios y guarda ficha y auditoría en una transacción. La edición comparte el bloqueo y la versión `expectedUpdatedAt` de las condiciones de pago; una edición desactualizada se rechaza. Cambiar plazo o cuenta corriente sólo influye en las propuestas futuras, no recalcula deudas confirmadas. No se agrega eliminación de proveedores históricos.

La pantalla presenta título con camión, búsqueda por nombre/contacto/correo/documento, filtros por cuenta corriente, tabla y paginación de 10/25/50 registros. Ver abre la ficha; Editar y Nuevo proveedor usan el mismo formulario. La exportación CSV incluye todos los resultados filtrados, no sólo la página visible, escapando celdas y prefijos de fórmulas. No exporta operaciones, saldos ni secretos.

El listado carga los proveedores de la organización y filtra/pagina en cliente; para catálogos de gran volumen se deberá migrar a paginación y búsqueda en servidor. No hay eliminación, mensajes automáticos, envíos de correo ni integración externa.

## Verificación local

Migración probada primero en esquema aislado y aplicada a gestion_dev después del respaldo `compras-v2-20261021-213020.dump` (387233 bytes, índice verificado; sin restauración completa). No se desplegó producción. Las pruebas de integración cubren contactos, permisos, versión esperada, auditoría y alta; las unitarias validan datos opcionales y límites. Edge headless a 1366×768, con API simulada, verificó listado, filtros, ficha, precarga/guardado de edición y apertura de alta. Capturas locales `.cache/suppliers-list.png` y `.cache/suppliers-editor.png`. Se retiraron las páginas temporales; no se crearon proveedores de prueba en los datos comerciales.
