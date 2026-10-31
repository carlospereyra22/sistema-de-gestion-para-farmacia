# Descuentos y actualización de clientes

El editor de descuento comienza vacío cuando no hay descuento, selecciona el importe al recibir foco, aplica con Enter y cancela con Escape. El campo vacío permite quitar el descuento. Admite pesos con coma decimal o punto decimal y separadores de miles argentinos; rechaza importes negativos, texto o decimales ambiguos. Se conserva el límite del subtotal y el reparto exacto en centavos.

Los editores lateral y modal no se montan simultáneamente, evitando que el foco se ubique detrás de la ventana de cobro. La selección del texto no activa el buscador del escáner.

Al aplicar un descuento, se reduce únicamente la asignación pendiente a cuenta corriente si supera el nuevo total. No se incrementa automáticamente esa financiación al quitar un descuento: se conserva el saldo pendiente para completar. Los importes cargados en efectivo, tarjeta y transferencia no se modifican silenciosamente. Un excedente cubierto por efectivo conserva el vuelto; si el excedente corresponde a tarjeta/transferencia se bloquea el descuento con un aviso para corregir ese pago. El servidor sigue validando el cobro al confirmar; este ajuste no escribe movimientos ni deudas por sí mismo.

Ventas permanece montada para conservar el carrito al cambiar de apartado. Por eso recarga clientes y saldos al volver a Ventas, recuperar foco en la ventana o volver a una pestaña visible, además de después del ticket. Las respuestas fuera de orden o posteriores a la salida de Ventas se ignoran; no se reinicia el cliente elegido ni el carrito. Los errores al cargar clientes ya no se silencian. No se añade sondeo periódico ni se modifica el catálogo.
