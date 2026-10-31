# Cobros con medios combinados

En Resumen del cobro, Pago mixto habilita importes para Efectivo, Tarjeta y Transferencia. Resto completa la diferencia en el medio elegido. Vacío o cero omite ese medio. Se conserva la selección de artículos y el pago parcial: el reparto debe sumar exactamente el total seleccionado, no necesariamente toda la deuda.

El endpoint existente de receipts admite `payments` opcional (hasta tres métodos únicos CASH/CARD/TRANSFER con centavos enteros positivos). Sin ese campo se mantiene el contrato de un solo medio. Con varios, `method` es OTHER; el desglose real se conserva en allocations como `{kind: "MIXED_RECEIPT", payments, items}`. El lector de asignaciones reconoce esta forma sin confundirla con ajustes de deuda ni cambiar registros históricos. Un único medio conserva el almacenamiento anterior. No requiere migración.

Se crea un solo movimiento CREDIT por el total y, si corresponde, un solo movimiento de caja por la parte CASH, dentro de la transacción serializable existente. Se revalidan caja abierta y sucursal, saldo del cliente y asignaciones. El idempotency key rechaza cambios de medios, importes, caja o artículos; reordenar los medios no duplica. No se confirman medios por separado ni se generan cobros parciales ante errores.

El recibo auditado conserva cada medio/importes y el saldo histórico; impresión y reimpresión muestran el desglose. El historial muestra Pago mixto. Los cobros usan la sesión seleccionada/única disponible. Sin sesión se conserva un registro pendiente de caja por recibo con sus medios; asignarlo luego no vuelve a reducir la deuda ni cambia la fecha del recibo. Sólo efectivo genera entrada física. No hay vuelto, intereses ni cargos automáticos.

Verificación: tests de centavos y validación, integración con fixtures revertidos (caja sólo por efectivo, idempotencia, selección y deuda, reimpresión) y compatibilidad con comprobantes anteriores. Implementación local; desplegar API antes que frontend.
