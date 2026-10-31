# Datos opcionales de facturación

Clientes permite cargar nombre/razón social, identificación tributaria o documento, condición frente al IVA declarada, domicilio, localidad, provincia, código postal, email y teléfono. Todos son opcionales; la carga rápida de nombre y lista de precios sigue disponible. La identificación y condición son texto declarado, no una validación fiscal ni un catálogo oficial.

El alta muestra una sección plegable. Los clientes existentes tienen la acción Datos de facturación, con guardar/cancelar y errores dentro de la ventana. El PATCH específico solo modifica facturación, no nombre comercial, documento anterior, lista de precios, saldos, límites de crédito, ventas ni comprobantes históricos. No emite facturas ni consulta ARCA.

El nombre principal del cliente (`Customer.name`) es el único nombre o razón social que se carga. La sección de facturación no lo repite: muestra identificación, condición de IVA (selector opcional) y domicilio. El campo anterior `billingName` se conserva en la base por compatibilidad, sin mostrarlo ni reenviarlo desde el formulario. No se migra ni sobrescribe el nombre de clientes existentes automáticamente. Localidad, provincia y código postal quedan bajo Más datos. Email y teléfono se muestran en Contacto, separado y plegable; se conservan los nombres de almacenamiento existentes. El selector conserva condiciones escritas previamente aunque no figuren entre sus opciones habituales. No se borran datos al plegar las secciones ni se asigna una condición por defecto.

Se agregan nueve columnas nullable a Customer con una migración nueva. Campos omitidos se conservan; campos vacíos explícitos se limpian a null. Se valida longitud y formato de email en el servidor. Acceso mediante JWT, pertenencia a la organización y PARTY_MANAGE para escribir; PARTY_READ para consultar clientes. Actualización y auditoría son transaccionales. La auditoría registra actor, cliente y nombres de campos, sin duplicar valores personales en ese registro.

Aplicada a gestion_dev local. Producción requiere migración y despliegue coordinados; no se aplicó automáticamente allí.

## Editar y eliminar clientes

La acción Editar permite actualizar el nombre principal, la lista de precios (validada dentro de la organización), facturación y contacto. No modifica saldos, crédito ni documentos comerciales. El formulario conserva una lista previamente asignada si no está entre las opciones actuales, y solo cambia la lista cuando el usuario la modifica.

Eliminar es una baja lógica (`active=false`) con confirmación y auditoría, nunca un borrado físico. Solo se permite con saldo neto cero (también se bloquea saldo a favor). La comprobación y escritura se realizan en una transacción Serializable. Mostrar eliminados permite consultarlos y restaurarlos; restaurar no altera configuración de crédito ni movimientos. Ventas ofrece únicamente clientes activos. Se mantienen JWT, pertenencia a organización y PARTY_MANAGE para todas las modificaciones. No se requiere otra migración.
