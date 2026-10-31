# Puesta en producción fiscal — revisión 03/10/2026

Estado: nueva emisión real NO declarada habilitada. Circuito C productivo y notas parciales implementados localmente, pendientes de cierre de verificación, publicación coordinada y activación. No se emitieron comprobantes reales durante estas pruebas. El titular confirmó que 00003 será exclusivo de este sistema y Casa Central; no se debe asociar otra sucursal ni asumir que el código local ya está en Oracle/Netlify.

## Avance de esta revisión

- Implementados FiscalDocument/FiscalProductionConfiguration separados de pruebas y migraciones nuevas `20260928150000_production_documents` y `20261003153000_production_point_exclusive`, aplicadas en desarrollo. No editar estas migraciones.
- Implementados activación auditada, factura C, notas C totales/parciales, liquidación de efectivo/cuenta corriente, impresión CAE/QR y selector con configuración fiscal.
- Ensayo local con PostgreSQL y SOAP simulado verifica reintentos, vuelto, notas parciales, liquidación idempotente, deuda por artículo y recuperación de respuesta perdida, sin contactar ARCA. No equivale a concurrencia real entre dos conexiones ni autorización fiscal externa.
- Pendientes operativos: respaldo externo de base y clave AES con restauración comprobada, revisión del VPS, publicación backend/Netlify, activación explícita y prueba física de QR/impresión. No marcar FISCAL_RECOVERY_VERIFIED=yes sin esa evidencia.
- Sólo C/bienes/PES para monotributo/exento. No habilitar A/B, servicios o moneda extranjera por cambiar etiquetas. RAW fiscal no implementado.

Los apartados siguientes son el checklist de puesta en marcha; las tareas implementadas arriba siguen requiriendo validación operativa antes de activar.

## Datos a confirmar con el titular

- Certificado de PRODUCCIÓN y autorización del servicio WSFE para el CUIT emisor. No confundir con WSASS de homologación.
- Punto de venta específico para Web Services en producción. Verificarlo por consulta oficial; no copiar el número de pruebas ni asumir que el punto 1 existe.
- Perfil fiscal vigente, domicilio, razón social, IIBB e inicio de actividades; nombre comercial separado del nombre legal.
- Instalación definitiva y responsable de respaldo/recuperación. Esta instalación tiene operaciones de prueba que no deben convertirse ni mezclarse con facturación productiva.

La clave fiscal sólo se utiliza en el portal oficial. Certificados y claves técnicas se cargan mediante el nuevo formulario Organización → Facturación → Preparar producción, no por chat ni en el formulario de homologación. Usar la web publicada después de actualizar Oracle/Netlify, no localhost.

## Preparación completada en código

- Credenciales separadas por ambiente y cifrado con contexto independiente; las pruebas existentes no se reemplazan.
- CSR de producción desde el servidor y guía oficial de Administración de Certificados Digitales/Administrador de Relaciones; carga PEM validada y versionada.
- Consultas productivas no emiten; activación y emisión están separadas y protegidas por flags/permisos. Una lista vacía no inventa ni asocia un punto.
- Custodio Oracle idempotente; preparado sin reiniciar API el 27/09/2026. Permisos de clave 440 root:ubuntu y copia local 600 root:root. No se leyó ni expuso el contenido. Requiere respaldo externo y recuperación antes de activación real.
- Falta publicar la nueva versión para utilizar esa configuración. Preparar archivos y consultar producción NO autoriza la emisión.

## Trabajo técnico pendiente antes de activar

1. Separar ambientes en configuración, certificados, tokens de acceso, puntos, documentos y bloqueos de numeración. Agregar migraciones nuevas; nunca cambiar las aplicadas ni convertir FiscalTrial histórico en facturas reales.
2. Custodia recuperable con clave maestra externa y respaldo probado. DPAPI CurrentUser de pruebas no permite trasladar la base por sí sola.
3. Conector WSAA/WSFE de producción con endpoints oficiales fijos; validación por consulta de identidad, autorización y puntos, sin emitir una factura real como comprobación de conexión.
4. Activación por organización y sucursal explícita, auditada y con permisos. Conservar el ambiente de cada documento para reimpresión/conciliación posterior.
5. Revalidar reglas de receptores y montos con manual vigente. Factura C para MONOTAX/EXEMPT está integrada en homologación; otros regímenes requieren impuestos por producto y selección de comprobante. No aplicar IVA 21% por defecto.
6. Completar documentos fiscales productivos, notas de crédito y ajustes, idempotencia concurrente, recuperación tras reinicio/respuesta perdida y reconciliación con numeración reservada. No anular facturas con la anulación de ticket.
7. QR fiscal según especificaciones oficiales y todos los datos obligatorios. El formato base del ticket se comparte, pero no omitir campos fiscales para igualar visualmente los comprobantes.
8. Integrar y verificar impresión térmica fiscal (incluida salida RAW si se quiere la misma experiencia directa del ticket). Probar QR legible, anchos, corte, documentos largos y reimpresión sin nuevas emisiones.
9. Ensayos integrales de permisos y aislamiento, rechazo, caída de red, doble clic, pago combinado, vuelto, cuotas/deuda, notas de crédito y recuperación de respaldos. Primer comprobante real sólo tras activación consciente sobre una operación real.

## Fuentes oficiales revisadas

- [Acciones para consumir un Web Service de factura electrónica](https://www.arca.gob.ar/fe/documentos/AccionesarealizarparaconsumirunWebservicedeFacturaElectr.pdf): certificados por ambiente, asociación al servicio y alta del punto de venta.
- [Documentación WSFE](https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp): manuales y versiones del servicio.
- [Emisión y autorización](https://www.arca.gob.ar/fe/emision-autorizacion/solicitud-autorizacion.asp): punto específico y distinto para el sistema emisor.
- [Factura electrónica y QR](https://www.arca.gob.ar/fe/): requisitos y documentación oficial a revalidar al implementar la salida productiva.
