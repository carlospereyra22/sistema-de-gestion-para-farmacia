# Facturación: homologación y circuito productivo C

Estado de código al 03/10/2026: circuito productivo de factura C, notas de crédito C parciales/totales, liquidación e impresión HTML con CAE/QR implementados, en verificación local. Esto NO significa que estén publicados o activados. Ver PRODUCTION_FISCAL_CHECKLIST.md. La activación permanece bloqueada por defecto.

## Producción implementada

`POST organizations/:id/fiscal-production/activate` exige ORGANIZATION_MANAGE, sucursal activa, punto exclusivo confirmado y consultado en ARCA, perfil MONOTAX/EXEMPT completo e IIBB, credencial productiva vigente/verificada, custodio AES y flags `FISCAL_PRODUCTION_ISSUANCE=enabled` y `FISCAL_RECOVERY_VERIFIED=yes`. El segundo flag certifica una comprobación operativa de respaldo/restauración; no debe establecerse para sortear el bloqueo. Reemplazar credenciales exige revalidar y reactivar. No se reasigna un punto existente a otro CUIT/sucursal. La consulta de conexión no activa por sí misma.

Ventas consulta capacidades por sucursal y presenta Factura o Factura · prueba según el ambiente. En producción solicita confirmProduction y fiscalEnvironment:PRODUCTION, conserva el receptor y sólo admite factura C de bienes en PES. Límite técnico por documento: $21.474.836,47. Consumidor final requiere identificación desde $10.000.000 según la regla oficial revisada. Tipos A/B, servicios, moneda extranjera, notas de débito e impuestos por producto no están implementados para producción.

`FiscalDocument` no modifica ni convierte `FiscalTrial`. Venta, cobros, stock y solicitud QUEUED se guardan atómicamente. La solicitud reserva numeración antes del envío; AUTHORIZED requiere respuesta coincidente y CAE válido. PENDING/UNCERTAIN bloquea el punto y sólo permite conciliación por consulta. No repetir la venta ante problemas fiscales. No hay reenvío automático ni worker. La bandera de emisión puede desactivarse conservando consulta/reimpresión de documentos existentes.

Rutas bajo organización/sucursal y venta, con SALE_MANAGE y BranchAccessGuard: GET/POST `sales/:saleId/credits`, POST `.../credits/:documentId/process`, GET/POST `.../credits/:documentId/settlement`. Notas C (13) referencian factura C (11) autorizada; cantidades e importes no pueden exceder lo facturado menos notas no rechazadas. UUID identifica la solicitud. Se distribuyen descuentos en centavos acumulados. La liquidación separada exige confirmación: reduce deuda pendiente asignada al artículo y devuelve el resto; rechaza saldos sin conciliación. Efectivo registra salida en caja abierta; tarjeta/transferencia no envían dinero al banco, registran lo confirmado por el operador. Mercadería recibida queda NO REPUESTA, sin stock vendible automático. La liquidación es Serializable e idempotente.

El encabezado térmico comienza por el nombre comercial (Farmacia Juncos si está configurado), comparte estructura con ticket y agrega datos fiscales obligatorios, CAE y QR. Notas identifican la factura asociada. Se usa impresión del navegador; RAW directo no admite comprobantes fiscales. Las pruebas controlan módulos del QR y contenido; no sustituyen lectura del QR impreso ni prueba física de corte/ancho.

## Homologación y configuración compartida

- Organización → Facturación guarda un perfil fiscal independiente del encabezado del ticket interno. Los campos pueden quedar incompletos; CUIT y fecha se validan si se informan.
- Lectura y modificación requieren permisos de organización. Guardado y auditoría son transaccionales, sin reemplazar datos de otras organizaciones ni del ticket.
- Ventas permite elegir Ticket interno o Factura · prueba. La factura C de homologación requiere confirmación explícita de que modifica stock y cobros locales. Clientes anteriores que omiten la selección conservan el flujo interno.
- La maqueta del perfil sigue siendo ilustrativa. Las pruebas autorizadas tienen una vista imprimible de 80 mm con número, CAE y vencimiento recibidos de homologación, siempre marcada SIN VALIDEZ FISCAL. Se imprime por el diálogo del navegador; no cambia el renderer RAW del ticket interno. No se inventan autorizaciones ni QR fiscales.
- Guardar el perfil NO habilita emisión. La clave fiscal personal nunca se solicita ni se guarda. Los archivos técnicos se gestionan por separado en Conexión ARCA.

## Asistente y prueba disponible (no producción)

Hay una sección separada «Preparar producción» para CSR, carga de certificado y
consulta de acceso/puntos reales. Las rutas organizations/:id/fiscal-production
exigen ORGANIZATION_MANAGE. Preparar credenciales y consultar no activa emisión;
la activación es una operación separada con los requisitos anteriores.
En producción se requiere AES-256-GCM: FISCAL_VAULT_KEY o
FISCAL_VAULT_KEY_FILE (archivo externo protegido). No preparar certificados
reales en la instancia local con DPAPI. En Oracle la configuración de la clave
se prepara sin reemplazar claves previas ni emitir facturas.

En Conexión ARCA, «Probar conexión con ARCA» obtiene o reutiliza un acceso WSAA para `wsfe` y consulta `FEParamGetPtosVenta`. Sólo usa URLs HTTPS fijas de homologación, sin redirecciones, con timeout de 20 segundos por llamada y respuesta XML limitada. Se rechazan DTD/entidades y XML malformado. El CMS se firma con SHA-256; las credenciales de acceso se cifran en base con contexto de organización y versión, nunca se devuelven al cliente ni se registran en logs. Reemplazar certificado invalida la caché. La configuración guarda cuándo se comprobó la conexión; esto no habilita producción.

Si ARCA devuelve 602 (sin resultados), no se declara una lista de puntos habilitados: la interfaz permite indicar explícitamente un punto sólo para homologación. Se consulta su último número antes de emitir. Esto no registra ni configura puntos de venta reales. Si ARCA sí devuelve un catálogo, sólo se aceptan sus puntos activos de tipo CAE. No se asocian sucursales automáticamente.

La prueba es una operación ficticia de bienes a consumidor final, distinta de ventas: C por $100 para perfiles MONOTAX/EXEMPT; B por $121 ($100 netos + $21 de IVA) para REGISTERED. La tasa 21% es exclusivamente del ejemplo, nunca una regla general para productos farmacéuticos. No descuenta stock, registra pagos, genera deuda ni modifica caja. El usuario confirma explícitamente antes del envío.

`FiscalTrial` conserva la instantánea del emisor, importes en centavos, fecha argentina, punto, tipo, numeración reservada, estado, CAE y vencimiento. Su ambiente tiene restricción HOMOLOGATION en base. No se eliminan registros. La solicitud lleva UUID idempotente por organización; la reserva y auditoría son transaccionales y un bloqueo serializa intentos. Un PENDING/UNCERTAIN impide nuevas emisiones en la organización. La llamada externa se realiza después de persistir la reserva; una respuesta perdida no se trata como rechazo. «Consultar resultado» utiliza FECompConsultar, valida identidad e importes y nunca reenvía. Si no se confirma coincidencia conserva UNCERTAIN para revisión. Un resultado terminal no se sobrescribe. Usar un punto de homologación dedicado a estas pruebas; ARCA no recibe nuestro UUID y no puede distinguir un comprobante idéntico enviado desde otro cliente.

API con ORGANIZATION_MANAGE: `POST organizations/:id/fiscal-testing/connect`, `GET .../trials`, `POST .../trials` (requestId, point, confirmHomologation:true) y `POST .../trials/:id/reconcile`. Producción y ventas reales no están accesibles desde estas rutas. El historial muestra los 30 intentos más recientes; todos se conservan en base. Se reimprime desde la instantánea sin nuevas solicitudes fiscales.

Verificación del 27/09/2026: autenticación WSAA y consulta WSFE reales; homologación autorizó una factura C 00001-00000001 por $100, conservada en el historial local de pruebas. No se verificó impresión física ni se emitieron comprobantes en producción. Tests de transporte, generación CMS, aislamiento, idempotencia, rechazo, timeout/conciliación y escape del documento usan fixtures, sin contactar ARCA.

### Asistente de configuración

Organización → Facturación → **Configurar facturación** abre cuatro pasos: datos de la farmacia, conexión ARCA, sucursales y revisión. Reutiliza el perfil guardado y propone retomar según el diagnóstico del servidor. Después de completar datos se prioriza conexión antes de pedir puntos, incluso si ya existen números cargados localmente. Navegar los pasos no marca requisitos cumplidos ni habilita emisión. Guardar y continuar avanza sólo después de una respuesta exitosa; un borrador incompleto sigue siendo válido como borrador y se señala en el diagnóstico.

Los editores se mantienen montados al cambiar de paso para conservar los borradores. El perfil con cambios sin guardar impide avanzar a otro paso y avisa al recargar/cerrar. Cambiar de organización reinicia el estado del asistente para evitar mezclar datos. La navegación no guarda datos automáticamente: sólo los botones explícitos de guardar/asociar lo hacen.

El paso Conexión revisa automáticamente la configuración local al abrirse. Las consultas externas y emisiones requieren botones explícitos; nunca emite al montar un componente. El usuario puede continuar a Sucursales sin confundir navegación con autorización. Las asociaciones de puntos por sucursal siguen en Opciones avanzadas, sin modificar los registros existentes.

### Preparación y carga de archivos

Conexión ARCA permite elegir «No tengo certificado» o «Ya tengo certificado y clave». El primer camino genera una clave RSA de 2048 bits y una solicitud PKCS#10 firmada con SHA-256. Usa la razón social guardada y pide el CUIT del titular que ingresará a WSASS; puede diferir del CUIT de la organización representada. Sólo descarga la solicitud pública; la clave privada nunca vuelve al navegador. La guía indica cómo obtener el certificado y autorizar el servicio en el portal oficial. El sistema no tramita esa autorización en nombre del usuario.

El segundo camino acepta un certificado PEM y su clave PEM correspondiente, con contraseña opcional del archivo (sólo en memoria). También permite cargar el certificado para la solicitud ya preparada usando la clave protegida en el servidor. No acepta PDF, imágenes, DER ni PFX. Valida formato, tamaño, RSA, coincidencia de claves, CUIT del titular, vigencia y que no sea un certificado de autoridad certificante. **No verifica todavía la cadena de confianza de ARCA, ambiente del certificado ni autorización del servicio**; un estado de archivos validados es exclusivamente local y nunca habilita facturas.

`FiscalCredential` guarda configuración versionada por organización y ambiente HOMOLOGATION/PRODUCTION. Las rutas de credenciales exigen ORGANIZATION_MANAGE y responden con Cache-Control: no-store. No exponen la clave privada. Generar/reemplazar requiere control de versión, confirmación explícita cuando hay archivos previos y transacción con bloqueo por organización. Un archivo inválido no reemplaza los datos guardados. La auditoría sólo contiene metadatos, nunca archivos ni contraseñas.

### Custodia y despliegue

La clave técnica se guarda **cifrada**, nunca en archivos planos, logs ni repositorio. En Windows no productivo se usa DPAPI CurrentUser con contexto por organización: sólo el mismo usuario de Windows puede abrirla. Copiar la base a otra máquina no basta para recuperar esas claves; usar esta modalidad sólo para pruebas locales. No existe todavía un flujo de exportación/rotación de claves: en otra instalación se debe generar una solicitud nueva o importar un par disponible y volver a autorizarlo cuando corresponda.

En servidor definitivo se requiere `FISCAL_VAULT_KEY` de 64 caracteres hexadecimales, suministrada mediante gestión externa de secretos; no agregar su valor al repositorio. Se utiliza AES-256-GCM con nonce aleatorio y contexto autenticado por organización y ambiente. Respaldar la clave maestra separadamente y con acceso restringido; perderla o cambiarla sin una migración de recifrado impide recuperar las claves existentes. Esta configuración de infraestructura corresponde al administrador del despliegue, no al comercio. Sin custodio disponible se bloquea la operación.

La carga requiere HTTPS (o loopback en desarrollo). Un proxy TLS debe reenviar `X-Forwarded-Proto: https` y conectarse a la API por loopback; no se confía en ese encabezado desde direcciones remotas. No registrar cuerpos de estas rutas en proxies, APM ni logs. La validación local y las pruebas automatizadas no sustituyen una revisión de seguridad del despliegue ni una prueba real de autorización de ARCA.

### Ventas de homologación con movimientos locales

La factura usa el mismo generador HTML térmico de 80 mm que el ticket interno: logo, nombre comercial configurado, productos, importes, descuentos, pagos y vuelto. Agrega razón social y demás datos del emisor, numeración y CAE en bloques fiscales. La ventana se monta fuera del grid de Ventas para conservar su ancho. Las nuevas solicitudes guardan nombre/logo del comercio, sucursal y cajero en su instantánea; las anteriores sin esos datos usan el encabezado actual, sin alterar su registro. Los datos fiscales históricos no se reemplazan. La impresión de factura sigue usando el navegador; la salida RAW directa del ticket aún no admite documentos fiscales.

La revisión de puesta en producción está en PRODUCTION_FISCAL_CHECKLIST.md. No se habilita producción ni se reutilizan certificados/puntos de homologación implícitamente.

La interfaz usa un selector compacto Ticket interno / Factura · prueba. Seleccionar factura y confirmar la venta envía confirmHomologation:true; no requiere una casilla adicional. El detalle del ambiente queda en la ayuda del selector y en el comprobante. El botón de confirmar permanece al pie del panel, separado del contenido desplazable.

Requiere perfil MONOTAX/EXEMPT, certificado vigente y un único punto activo de homologación asociado a la sucursal. La selección y confirmación se revalidan en servidor, junto con precios, stock y pagos. La venta COMPLETED y FiscalTrial QUEUED se guardan atómicamente; después del commit se intenta autorizar en ARCA. El UUID de la venta impide duplicar stock/cobros ante reintentos. No se debe repetir la venta si la factura falla: consultar desde Ventas → Historial → Ver / imprimir factura de prueba.

GET sales/:saleId/invoice (SALE_READ) y POST sales/:saleId/invoice/process (SALE_MANAGE), bajo organización/sucursal y BranchAccessGuard, permiten leer y recuperar la solicitud. QUEUED se puede enviar; PENDING/UNCERTAIN se concilia sin reenviar. Sólo AUTHORIZED permite impresión fiscal de prueba, usando instantáneas de productos, descuentos y cliente. Una venta INVOICE no usa el endpoint ni renderer de ticket interno. No hay worker automático.

La anulación de QUEUED/REJECTED revierte localmente con las reglas habituales de caja. PENDING/UNCERTAIN/AUTHORIZED y devoluciones fiscales quedan bloqueadas hasta implementar notas de crédito. Todo movimiento sigue siendo real dentro de la base local, aunque el comprobante carezca de validez fiscal. No usar datos productivos para estas pruebas.

### Alcance del asistente de homologación y límites

El diagnóstico de homologación no indica la activación productiva de la sucursal. Completar una prueba no habilita ventas reales. Producción usa tablas y activación separadas según el apartado inicial. Otros regímenes requieren un circuito impositivo que permanece bloqueado, sin asumir IVA 21%.

Los puntos de pruebas se guardan en `FiscalPoint`, restringido a HOMOLOGATION, por organización y sucursal. El número es único por organización y ambiente; una FK compuesta impide sucursales de otra organización. No se reasignan: se desactivan/reactivan con auditoría conservando el registro. Guardarlos NO crea ni verifica puntos de ARCA. Producción usa exclusivamente `FiscalProductionConfiguration`, sin relajar las restricciones históricas.

API: `GET organizations/:id/fiscal-setup` requiere ORGANIZATION_READ; `POST organizations/:id/fiscal-points` y `PATCH organizations/:id/fiscal-points/:pointId` requieren ORGANIZATION_MANAGE. Estas rutas de configuración no exponen secretos ni emiten solicitudes externas; las rutas fiscal-testing sí consultan homologación.

Para la prueba externa se necesita certificado de testing y autorización de `wsfe` mediante WSASS, separados de producción. No enviar claves por chat; cargar archivos técnicos únicamente en el formulario seguro de Conexión ARCA. No hay simulador que genere CAE ficticios.

Antes de activar: confirmar datos fiscales con el titular/asesor, restaurar respaldo externo, verificar despliegue y permisos, completar ensayos de concurrencia e impresión física y revisar el checklist. La primera emisión productiva debe corresponder a una operación real confirmada; no generar comprobantes ficticios para probar conectividad.

Referencias oficiales consultadas (revalidar requisitos al implementar el conector):

- [Servicios de factura electrónica](https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp)
- [Solicitud de autorización](https://www.arca.gob.ar/fe/emision-autorizacion/solicitud-autorizacion.asp)
- [Certificados](https://www.arca.gob.ar/ws/documentacion/certificados.asp)
- [QR de factura electrónica](https://www.arca.gob.ar/fe/qr/conceptos-generales.asp)
