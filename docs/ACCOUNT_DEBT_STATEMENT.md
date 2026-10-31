# Resumen de cuenta A4 / PDF

Actualización de presentación: el detalle imprimible muestra únicamente ventas y cobros. La API identifica aumentos manuales y ajustes de referencia por su metadata estructurada, no por el texto del motivo. Los renglones internos y compensatorios no se imprimen; los saldos inicial/final y acumulados conservan todos los movimientos, con aclaración visible para no confundirlos con la suma de los renglones visibles. No se altera deuda, precio histórico ni historial. El filtro de deuda pendiente sigue mostrando los importes actuales.

La ventana tiene altura estable y una vista previa persistente: cambiar filtros actualiza su documento sin volver a montar/navegar el iframe. Cada modo se consulta una vez por apertura o actualización explícita; errores bloquean impresión y conservan la vista anterior identificada como no actualizada. Los períodos rápidos y el rango personalizado se eligen dentro de la misma ventana; un rango incompleto conserva la vista anterior y bloquea imprimir hasta ser válido.

El acceso «Resumen de cuenta» está junto a «Pagar todo». Por defecto imprime el estado completo: cargos, créditos/cobros, ajustes y movimientos compensatorios, incluyendo cuentas saldadas. Permite un cliente o todos, todas las fechas o un período inclusivo de movimientos en Argentina. Muestra saldo anterior al inicio y saldo final al cierre; conserva el saldo en períodos sin movimientos y permite saldo a favor negativo.

La lectura `GET organizations/:organizationId/branches/:branchId/customer-accounts/statement` exige ACCOUNT_READ y acceso a la sucursal. Consulta una instantánea RepeatableRead con movimientos filtrados por organización y sucursal, ordenados por fecha e identificador. El servidor calcula saldos acumulados con BigInt. El informe no representa el saldo global entre sucursales. Conserva clientes archivados con historia; no modifica datos.

La opción «Solo deuda pendiente» conserva el informe descrito a continuación. Su rango usa fecha de venta y deuda actual, no saldo histórico. Cambiar de modo vuelve a consultar la fuente correspondiente.

En el modo «Solo deuda pendiente», la vista previa A4 permite cliente seleccionado, cualquier cliente del listado o todos; fechas de venta completas o rango inclusivo con uno o ambos extremos. Se filtra la fecha civil de la venta en Argentina, no el vencimiento y no un saldo histórico a fecha de corte.

Fuente: consulta existente de vencimientos por organización/sucursal, protegida con ACCOUNT_READ y acceso a sucursal, ejecutada en RepeatableRead y calculada con las asignaciones de deuda del servidor. El resumen corresponde sólo a ventas pendientes de la sucursal seleccionada, no al saldo global del cliente entre sucursales ni a movimientos ajenos a ventas. Incluye ventas sin vencimiento; omite saldadas y anuladas según esa consulta.

Filtrado y sumas de presentación se realizan sobre la instantánea consultada, con BigInt en centavos. Al actualizar se obtiene otra instantánea; el documento muestra hora de generación en Argentina. Las ventas con conciliación pendiente se señalan y no se suman al total confirmado, que se identifica como parcial. Si se selecciona un rango, las ventas sin fecha verificable quedan fuera con advertencia.

La impresión usa un iframe dedicado con datos escapados, sin scripts y con CSS A4, márgenes y encabezados de tabla repetibles. El usuario selecciona una impresora A4 o Guardar como PDF en el diálogo del navegador. No usa la impresora térmica ni genera recibos, cobros, movimientos o comprobantes fiscales. No requiere migraciones, endpoints de escritura ni nuevas dependencias.
