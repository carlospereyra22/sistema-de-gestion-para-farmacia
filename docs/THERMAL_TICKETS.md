# Tickets RAW integrados en Gestión

Organización permite subir un logo PNG/JPG/WebP de hasta 5 MB. Se convierte, conservando proporciones y fondo blanco, a raster monocromo de 128 × 128; la vista previa muestra el mismo raster que imprime ESC/POS. Se guarda en `Organization.ticketHeader.logoRaster` (4096 caracteres hex validados), con los permisos y auditoría del encabezado, sin migración. Guardar encabezado confirma el cambio para ventas y cobros. Sin logo personalizado se conserva el original. El componente de impresión debe reiniciarse para cargar esta actualización; no se reenvían tickets pendientes.

Historial de ventas: 10 registros por página sobre las últimas 200 ventas que devuelve el endpoint existente; CSV conserva todos los resultados cargados y filtrados. El detalle se abre en diálogo con impresión, total, motivo y acciones existentes; no se eliminan ventas históricas. Los filtros vuelven a la primera página y las operaciones muestran su respuesta dentro del diálogo.

## Impresión actual — 14/09/2026

Se recupera el generador ESC/POS V21 validado por el usuario: logo y nombre bitmap, cuerpo 1x1 bold, signos $ sin bold, TOTAL doble, barcode y corte. Se mantienen las alineaciones corregidas y los datos reales de Organización/Usuarios. La densidad física 4 no se modifica. Esta decisión reemplaza el circuito HTML del navegador.

Un clic en Imprimir ticket desde venta confirmada, historial de ventas, cobro o historial de cobros monta `DirectTicketPrint` y envía automáticamente el ticket. No hay vista previa obligatoria ni diálogo de Windows. Un aviso no modal informa el envío o error, incluso sobre el diálogo de cobro. Éxito significa aceptado por el spooler, no salida de papel comprobada. No se marca una operación comercial como impresa.

## Componente administrado

- Instalación por usuario: `scripts/configurar-impresion-automatica.ps1`, tarea `Gestion-Impresion-<hash de carpeta>`. Arranca al entrar a Windows, con nivel limitado y sin contraseña almacenada. Windows reintenta si el supervisor termina con error (cada minuto, hasta 999 intentos).
- La tarea inicia `supervisor-impresora.ps1` / `thermal-agent/supervisor.js`. Una named pipe evita supervisores duplicados. Cada 5 segundos comprueba salud; reinicia su propio proceso hijo si termina o tras tres comprobaciones fallidas. Nunca mata procesos ajenos ni reenvía tickets. Si otro proceso ocupa el puerto, requiere atención.
- El inicio de Gestión también prepara el supervisor como respaldo. Cerrar la página o detener la API no detiene la impresión. No requiere abrir una consola diariamente.
- Indicador en Gestión consulta `/status`: componente conectado e impresora instalada. No garantiza papel, tinta, cola sin errores ni conectividad física. Si el navegador bloquea red local/origen, debe autorizarse el sitio confiable.
- Escucha solo en 127.0.0.1:17890, orígenes exactos configurados. Sin endpoints de ejecución arbitraria o instalación desde la web.
- Configuración de impresora/orígenes: `scripts/thermal-agent/config.json`. Registros: `.cache/thermal-agent`. La tarea depende de que esta carpeta y Node no se muevan.
- Quitar inicio automático: ejecutar `scripts/configurar-impresion-automatica.ps1 -Remove`; no borra registros comerciales ni de impresión. Revisar procesos hijos si se utilizó un arranque manual independiente.

## Protección contra duplicados

La web guarda requestId/estado por comprobante en localStorage antes de enviar y comparte la operación en curso ante doble clic/StrictMode. Si no puede guardar el intento, no imprime. No guarda contenido del comprobante ni datos personales.

Si el resultado anterior fue incierto o ya enviado, otro clic no vuelve a imprimir automáticamente. Reintentar el mismo envío es explícito y conserva requestId. Otra copia exige confirmación y genera uno nuevo. Distintos perfiles/equipos pueden pedir copias independientes; no se promete exactly-once físico.

El agente reserva el ID de forma exclusiva antes del RAW y persiste hash/estado en `.cache/thermal-print-jobs`. Una repetición confirmada no imprime; una reserva pendiente o error parcial requiere revisar cola/papel. Reiniciar el componente conserva estas reservas y NO reproduce trabajos.

## Datos y presentación

- Encabezado: Administración → Organización; nombre del comercio, dirección, ciudad, provincia, CUIT y teléfono. Se guarda por organización en PostgreSQL (`Organization.ticketHeader`), con ORGANIZATION_READ/MANAGE y auditoría transaccional. Sin ejemplos personales en inputs ni fallback del agente. Se omiten campos vacíos. Si no se configuró, se usa solo el nombre administrativo existente.
- Atendió: Administración → Usuarios → campo opcional Nombre para el ticket en Nuevo usuario, o botón Editar de cada usuario existente. Se elimina el panel superior independiente. Campo `UserOrganization.displayName`, específico de la organización, opcional, hasta 120 caracteres. Con USER_MANAGE se puede editar el nombre propio o de otro miembro sin tocar roles, sucursales, email ni contraseña. Se audita dentro de la transacción. Un usuario de otra organización no se puede editar.
- Los tickets recuperan el nombre del actor que registró la venta/cobro según su auditoría, no el nombre de quien reimprime. Si no tiene nombre configurado, se omite Atendió, nunca se sustituye por email. El nombre mostrado es configuración actual, no snapshot histórico.
- Ticket, fecha, atendió, sucursal y cliente se presentan en dos columnas: etiqueta izquierda y valor derecha, con wrap de valores largos.
- Ventas: endpoint `GET .../sales/:saleId/ticket` con JWT, acceso a sucursal y SALE_READ. Precios, cantidades, descuentos, pagos, total y fecha vienen de la venta persistida. Se usa BigInt para subtotal/vuelto; no precios actuales. Nombre actual de producto/cliente y encabezado son metadatos, no snapshots.
- Cobros: endpoint e instantánea histórica existentes, incluidos importes por artículo y saldo al cobrar. Si no existe saldo histórico, se omite. No se inventan cantidades para pagos parciales.
- Referencia visible y barcode Code39: primeros ocho caracteres del UUID, igual al número que ya mostraba el sistema. No se cambia la numeración. El UUID completo permanece en los datos, pero se quitaron del papel las líneas Operación y Comprobante interno / No es factura fiscal, por decisión del usuario. Esto no convierte al ticket en factura fiscal.
- Contrato `ThermalTicket`: centavos en strings. Ninguna impresión modifica stock, caja, pagos, deuda ni ventas.

## Archivos y verificaciones

Impresión: `direct-ticket-print.tsx`, `lib/direct-ticket-print.ts`, `lib/thermal-agent.ts`, `thermal-printer-status.tsx`, `workspace-shell.tsx`, `customer-accounts.tsx`.
Componente: `scripts/thermal-agent/{server,supervisor,recovery,escpos-v2}.js`, bitmaps y helper RAW, scripts de instalación/inicio.
La plantilla HTML y sus utilidades anteriores se conservan, pero no están conectadas a los botones principales.

Pruebas automatizadas: doble clic, StrictMode, confirmación para copias, almacenamiento fallido, desconexión previa, respuesta perdida, reutilización del ID, recuperación de hijo caído/no respondiente, validación de payload, barcode/corte y formato monetario.

Prueba física pendiente: elegir un comprobante real, pulsar Imprimir ticket UNA vez y cotejar con el V21 en papel (logo, nombre, densidad, $, TOTAL, columnas, descuentos, pagos, barcode, corte). No generar ventas ficticias. La integración se aplica localmente, no implica despliegue en producción.
