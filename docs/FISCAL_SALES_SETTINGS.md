# Configuración fiscal por venta

El botón `…` junto a Factura abre un diálogo fuera del panel desplazable de cobro. No selecciona Factura automáticamente ni aumenta la altura del panel salvo una línea de resumen al elegirla.

- Receptor por defecto: Consumidor final, con nombre y DNI/CUIT opcionales.
- Alternativa: datos fiscales del cliente seleccionado, leídos y validados nuevamente por la API. El cliente comercial y su cuenta corriente no se modifican.
- `GET organizations/:org/branches/:branch/sales/fiscal-options` exige SALE_MANAGE y BranchAccessGuard. Informa sólo los tipos soportados por el emisor y el motor existente. No consulta ARCA ni emite.
- `fiscalOptions` de la confirmación se valida con DTO y reglas de negocio. El servidor no acepta otros tipos aunque se altere el HTML. Se conserva el receptor en `FiscalTrial.saleSnapshot` dentro de la transacción de venta.
- Confirmar, descartar o vaciar restablece las opciones por venta. Cancelar el diálogo no guarda. Las opciones no se guardan en localStorage.
- Un reintento conserva el comprobante de la operación original. Nunca reemplaza sus datos fiscales ni vuelve a cobrar.

## Estado de producción

Este cambio NO habilita facturas reales ni modifica documentos históricos. La conexión productiva y el punto 00003 fueron verificados previamente, pero el motor de ventas, conciliación y notas de crédito productivas siguen pendientes. El usuario confirmó que 00003 es exclusivo de Casa Central en este sistema; esa confirmación todavía no equivale a una asociación/activación persistida.

La migración nueva `20260928150000_production_documents` sigue sin aplicar: prepara tablas separadas y restricciones, no un circuito terminado. No desplegarla ni activar producción sólo para cambiar el texto del selector. Antes de activar: implementar emisión y recuperación, QR/impresión fiscal, compensaciones por notas de crédito, prueba de respaldo externo de claves y pruebas completas sin emisiones sintéticas productivas.

## Verificación local del menú

28/09/2026: lint, typecheck y build correctos; API 232 pruebas, web 212 y agente térmico 18. Incluye integración con transacción revertida, SOAP simulado, receptor identificado persistido y reintento sin cobros duplicados. Formato aplicado sólo a los archivos modificados para no reformatear trabajo ajeno. API y web locales iniciadas. No se verificó interacción visual en navegador ni impresión física, ni se desplegaron estos cambios en Oracle/Netlify. Sigue pendiente definir si las notas de crédito iniciales serán completas o también parciales.
