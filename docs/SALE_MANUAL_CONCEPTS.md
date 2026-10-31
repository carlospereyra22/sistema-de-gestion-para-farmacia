# Conceptos fuera del catálogo

Las descripciones guardadas se buscan escribiendo parte del texto, sin distinguir mayúsculas ni tildes. El desplegable permite clic o flechas y Enter; Escape cierra las sugerencias sin cerrar el formulario. Elegir una descripción lleva al precio, sin agregar ni cobrar automáticamente.

El botón + junto a Descripción permite guardar sólo ese texto para usos posteriores. El selector de guardados rellena la descripción y lleva el foco al precio; no guarda ni propone precios. Se persiste en localStorage del navegador por organización y usuario, sin sincronización entre PCs ni escritura en catálogo. No se guarda automáticamente al vender. Los duplicados por mayúsculas/espacios exteriores se evitan; si el almacenamiento falla se informa y la venta manual sigue disponible. Las descripciones son atajos de carga, no productos ni registros comerciales. Se mantienen las validaciones y el circuito servidor de conceptos existentes.

Ventas ofrece **Agregar concepto** dentro del menú `⋯` junto a «Buscar productos», reemplazando el indicador visual F2 (el atajo sigue funcionando). Los puntos del selector de comprobante mantienen únicamente la configuración de facturación. Se ingresa una descripción (3–160 caracteres) y un precio unitario positivo en pesos, sin separador de miles. Se agrega inicialmente una unidad; la cantidad puede editarse directamente o con los botones −/+, igual que un producto. El subtotal es precio por cantidad, menos el descuento del renglón. No crea productos ni modifica lotes o stock. Para mercadería habitual debe utilizarse el catálogo.

La descripción queda persistida en `SaleItem.description`, con `productId` y `lotId` nulos. Una restricción de base distingue estos renglones de los productos históricos. El servidor valida descripción, cantidad, importe y descuento; no permite utilizar este circuito para sobrescribir el precio de un producto existente. Requiere los mismos permisos de venta.

Participa del total, descuentos, cobros, caja y cuenta corriente mediante el circuito transaccional existente. No tiene precio de referencia para actualizar deudas. Los reportes incluyen su ingreso en ventas/cobros, pero no lo cuentan como producto del catálogo en el ranking.

El ticket conserva cada concepto por separado. Las facturas y notas de crédito conservan su descripción e importe en las instantáneas, sin cambiar los ambientes, validaciones ni habilitaciones fiscales existentes. La anulación de una venta interna no intenta devolver stock por esos renglones. Las devoluciones físicas sólo admiten productos; una corrección monetaria utiliza anulación o nota de crédito según el comprobante. La recepción física de una nota de crédito excluye conceptos.

Migraciones: `20261006010000_sale_manual_concept` y `20261006020000_sale_concept_quantity` (habilita cantidades enteras positivas). No borran ni transforman ventas históricas. No revertirlas eliminando conceptos ya cobrados: si se retira la opción visual, conservar soporte para consultar sus comprobantes, anular y acreditar.

Pruebas: validación de conceptos, separación en tickets, entrada de importes, menú compacto y prueba de integración con rollback (venta mixta, sólo concepto, pago, idempotencia, devolución y anulación sin inventario ficticio). La impresión física y la emisión real ARCA requieren validación operativa separada.
