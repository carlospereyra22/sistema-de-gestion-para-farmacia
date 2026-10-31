# Precio unitario especial en Ventas

La celda Precio unit. admite edición directa para productos del catálogo. Al entrar se selecciona el importe sin separador de miles; Enter o salir del campo confirma, Esc cancela. Acepta pesos y centavos. El precio se presenta centrado, con tamaño y peso equivalentes al subtotal; el borde aparece al pasar el cursor o editar. Escribir el precio de lista restablece el valor original. No se habilitan aumentos sobre la lista desde este circuito de descuentos.

Al pasar el cursor o enfocar se muestra una tarjeta con el costo registrado por unidad de stock de los lotes vendibles de la sucursal, identificando cada lote. No se calcula un costo promedio ni se convierte el costo por el divisor comercial de precio. Si no hay lotes disponibles se informa que no hay costo disponible (un costo guardado en cero sí se muestra). Se muestran hasta cuatro lotes y se informa si hay más para consultar en Inventario. Es una referencia del stock consultado, no una asignación definitiva de los lotes de la venta. La tarjeta se renderiza fuera del área desplazable para evitar recortes y se cierra al desplazar, desenfocar o retirar el cursor.

La tarjeta de costo se oculta automáticamente a los dos segundos, incluso manteniendo el cursor encima. Esta duración es independiente de las notificaciones generales. Volver a entrar con el cursor permite mostrarla nuevamente. Sólo puede haber una tarjeta visible: entrar en otro producto cierra la anterior inmediatamente. Salir, desplazar o desmontar el campo cancela su temporizador; la limpieza de una fila anterior no afecta al aviso más reciente.

Abrir el menú de cuenta descarta cualquier tarjeta de costo visible y bloquea nuevas tarjetas por hover o foco hasta cerrarlo. Cerrar o desmontar el menú libera el bloqueo sin reabrir automáticamente un costo anterior. Se aplica a todos los anchos de pantalla, incluida la vista compacta.

El backend resuelve el precio vigente de la lista y sus respaldos, valida `requestedUnitPriceMinor` contra el importe original y exige `expectedUnitPriceMinor`. El campo es opcional, compatible con clientes anteriores, y no se permite combinarlo con un concepto manual. La operación utiliza los permisos, transacción y FEFO existentes. No hay migración ni cambio de ProductPrice.

SaleItem conserva el precio especial efectivamente vendido; los descuentos generales siguen en discountMinor. La auditoría COMPLETED conserva priceOverrides con precio original, nuevo, cantidad y motivo, junto con el actor. Tickets (incluida agrupación por lotes), instantáneas fiscales, saldos y devoluciones usan los importes históricos vendidos.

El subtotal se recalcula al editar. Si el descuento general ya aplicado supera el nuevo subtotal de la fila, se pide corregirlo antes. Los pagos se revisan con el mismo criterio del descuento general: sólo puede reducirse la financiación pendiente; no se cambian silenciosamente efectivo/tarjeta/transferencia. Al cambiar los precios efectivos o la selección comercial se retiran precios especiales del borrador y se revisan pagos.

El campo usa la detección de ráfaga del control de cantidad: un escaneo rápido terminado en Enter intenta agregar el producto y no aplicar el código como precio; Enter/Esc devuelven el foco al buscador. La lectura física debe verificarse con el escáner instalado.

Pruebas: límites/precio obsoleto en servidor; venta descontada repartida en dos lotes con descuento general, ticket, catálogo intacto, auditoría y anulación; instantánea fiscal de homologación con SOAP simulado; presentación accesible del editor. Ninguna prueba emite en ARCA real.

# Descuento por producto en el carrito

La columna Descuento permite ingresar porcentaje (0–100, hasta dos decimales) o pesos por unidad sobre el precio original de la lista. Convierte la entrada al precio especial existente; no suma una segunda rebaja. Cambiar de unidad sólo cambia la presentación. Precio unitario sigue siendo editable y ambos campos se sincronizan. El precio original aparece tachado cuando hay rebaja.

Se confirma al salir del campo o con Enter; Escape descarta la edición. Vacío o cero restaura el precio original. Se mantienen las validaciones transaccionales del precio especial, los pagos y el descuento general posterior. Los conceptos manuales no incorporan este control. El porcentaje se redondea a centavos sobre el precio final; no se guarda un porcentaje adicional ni se modifica el catálogo.
