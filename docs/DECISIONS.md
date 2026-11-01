# Decisions

## DECIDED

- Login y recuperación de acceso (01/11/2026, SISTEMA-7): nueva pantalla de ingreso (`login-screen.tsx`) con panel de producto y tarjeta de acceso, paleta verde azulado intermedia entre el teal del sistema y el azul del logo. Email y contraseña, sin selector de sucursal (se elige después de entrar). «¿La olvidaste?» explica pedir una nueva al administrador, que puede restablecerla (ver BUSINESS_RULES). La recuperación por email queda para la epic Cuentas y seguridad (requiere servicio de correo). «Pedí una demo» y «Volver al sitio» usan `VITE_LANDING_URL`; sin esa variable en producción no se muestran. Nombre provisorio Farmatec.
- Reportes interactivos (31/10/2026, SISTEMA-2): las definiciones de cada metrica viven en `docs/REPORTS_PLAN.md` y los tipos en `packages/contracts/src/reports.ts`; todas las pestanas y exportaciones las comparten. Importes como centavos en string. Ventas por medio de pago restan el vuelto al efectivo (la pantalla anterior no lo hacia). Devoluciones se restan en la fecha en que ocurren. Costo y margen son estimados por costo de lote. "Todas las sucursales" se ofrece solo con 2 o mas sucursales autorizadas y se calcula en cada consulta. Umbrales por defecto editables: stock bajo 5, sin movimiento 30 dias, vencimientos 90 dias. Permisos nuevos `REPORT_PROFIT_READ` y `REPORT_EXPORT`.

- La opción «Descartar venta» del aviso de venta pendiente descarta directamente el borrador, sin segunda confirmación. No anula ni elimina ventas registradas; reemplaza la confirmación adicional acordada inicialmente.

- 20/09/2026: la venta pendiente se conserva en memoria al navegar entre apartados o Historial dentro de la misma sesión/sucursal. Al volver al punto de venta se ofrece continuar o descartar con confirmación. No se crea venta ni se reserva stock al suspender; el backend sigue validando al confirmar. Se advierte antes de recargar/cerrar pestaña, cambiar de sucursal o cerrar sesión; no hay recuperación persistente después de recargar. La organización/sucursal delimita el estado para impedir mezclar ventas.

- 20/09/2026: se incorpora Publicar Produccion.cmd como despliegue asistido. Usa una copia aislada, checks locales, release separado en Linux, verificación de migraciones históricas, respaldo con restauración de prueba y health antes de preparar SUBIR-A-NETLIFY. Reutiliza secretos y servicio existentes; Netlify sigue manual. No ejecuta seed/reset ni rollback automático de datos. Ver PUBLICAR_PRODUCCION.md. Crear/probar el lanzador no implica desplegarlo.

- 20/09/2026: se amplía la densidad seleccionable a 1–8, manteniendo 4 por defecto, según el rango mostrado por el controlador Xprinter del usuario. API y agente 1.0.4 validan este rango. La equivalencia física de cada nivel con el controlador sigue pendiente de prueba; no se extiende la compatibilidad a otros modelos.

- 20/09/2026: Tickets y comprobantes permite ajustar densidad 1–4 del perfil Xprinter XP-80 (4 por defecto). Se guarda por organización en ticketHeader, validada por API y agente, usando permisos/auditoría existentes; ventas y cobros usan el valor al cargar el documento. No modifica el diseño ni garantiza compatibilidad con otras impresoras. Requiere agente 1.0.3-pilot o posterior; actualizado en esta PC, pendiente prueba física y producción.

- 20/09/2026 (posterior a la prueba en papel): se rechazó la adaptación HTML por calidad. Se restaura RAW y se prueba un agente local instalable desde la web en cada PC. El piloto tiene selector de impresora, runtime incluido e inicio por usuario con WScript, sin consola permanente; V21 es el perfil físico y no significa Cloud V24 instalado. Ver LOCAL_PRINT_AGENT.md. No se modificó producción.

- 20/09/2026: el flujo solicitado es impresora/controlador en cada PC e impresión desde el navegador, sin agente ni Print Box. El botón compartido abre directamente el diálogo del navegador. Se adapta el formato V24 con sus bitmaps originales y medidas físicas, preservando datos reales. La equivalencia física queda pendiente de comparar papel; no se promete fuente ROM, densidad RAW ni corte controlados por CSS. Ver BROWSER_PRINT_V24.md. No habilitar Cloud V24 ni publicar el paquete anterior como si incluyera este cambio.

- Organización tiene un espacio independiente (`?pagina=organizacion`) con Datos generales, Sucursales y Tickets y comprobantes. Ya no comparte pestañas con Usuarios/Roles. Los enlaces anteriores a Administración/branches siguen abriendo Sucursales. No se agrega Configuración general ni controles para modificar el formato físico del ticket.
- Datos generales y Tickets editan la misma fuente persistida de identidad/encabezado (nombre comercial, logo, dirección, ciudad, provincia, CUIT y teléfono); no hay copias ni datos de ejemplo. El editor conserva cambios al alternar las secciones. Los nombres de atención usan la edición existente por usuario/organización.
- Sucursales incorpora dirección, ciudad, provincia y teléfono opcionales. Crear, editar, desactivar, reactivar y eliminar requieren ORGANIZATION_MANAGE y registran auditoría. La eliminación es lógica (`deletedAt`) y se admite solo sin registros comerciales/cajas vinculados; las sucursales con historial pueden desactivarse y reactivarse. No se elimina historial ni se reutiliza su código. Se conserva al menos una sucursal activa y se deben cerrar sus cajas antes de desactivarla. El selector operativo muestra solo activas y conserva la selección mientras siga válida.
- Despliegue: ejecutar las migraciones versionadas antes de iniciar la nueva API y regenerar Prisma al construir. `20260920010000_branch_details` agrega columnas con valores vacíos para sucursales existentes. Aplicada únicamente en gestion_dev local el 20/09/2026, junto con la migración pendiente de la cola V24 (solo esquema; la cola continúa deshabilitada). No se desplegó al VPS.

- El encabezado presenta un menú de cuenta con iniciales, nombre configurado (o nombre del comercio) y sucursal activa. El correo y Cerrar sesión quedan dentro del desplegable. Usa los datos existentes de auth/me; no modifica autenticación ni permisos. Escape y clic exterior cierran el menú; los atajos de búsqueda de Ventas se suspenden mientras está abierto.

- Productos muestra 10 resultados por página, usando el mismo componente visual de paginación que el historial de ventas. La búsqueda y los filtros se aplican al catálogo cargado completo antes de paginar; cambian a la primera página y se ajusta la página al reducirse los resultados. No cambia la API ni las operaciones del catálogo.

- Los cobros de cuenta corriente muestran un diálogo de confirmación con el diseño de ventas y las acciones Cerrar / Imprimir ticket. El ticket identifica el recibo, pero omite los códigos internos de venta debajo de los artículos; esos vínculos se conservan en el sistema y en auditoría. La reimpresión sigue disponible en Historial.

- Node.js 24, TypeScript strict, pnpm workspaces, React/Vite and NestJS REST.
- PostgreSQL plus Prisma remains the data platform.
- The initial operational model is Organization to Branch with UUIDs.
- The application begins as a modular monolith.
- Fase 1 uses email and password authentication with Argon2id hashes, a 15-minute access JWT and a revocable seven-day refresh session in an HttpOnly cookie.
- Users are global identities. Membership, roles and branch assignments are organization-scoped through `UserOrganization`, `UserOrganizationRole` and `UserBranch`.
- The initial roles are `OWNER`, `ADMIN` and `USER`. Only the first two receive the initial user and role administration permissions.
- Products do not require an internal code initially; barcodes remain an independent, multi-value relation.
- Catalog prices use Argentine pesos stored as integer minor units. The first release keeps a current price per product and price list; dated price validity is deferred.
- `Sistema_Gestion_Farmacia_Especificacion_Funcional_v1.pdf` is the functional reference for the MVP. Its priorities are operational integrity, traceability by lot and branch, and auditable commercial documents; fiscal, prescription and external integrations remain post-MVP.
- La V2 funcional/visual y su especificación técnica externa (`Sistema_Gestion_Farmacia_Diseno_Funcional_Visual_V2.pdf` y `Sistema_Gestion_Farmacia_Implementacion_Tecnica_V2.md`) guían la evolución incremental. Cuando entren en conflicto con `BUSINESS_RULES.md`, se registra la discrepancia antes de alterar una regla comercial.
- La API expone OpenAPI en `/api/docs`; cada respuesta de error tiene un formato consistente y un `requestId` para trazabilidad. Las rutas operativas por sucursal requieren asignación explícita del usuario a esa sucursal.

- Las referencias externas de medicamentos y precios se integrarán mediante adaptadores autorizados (API o archivo con licencia). Sus datos son sugerencias editables: nunca modifican por sí solos el catálogo ni los precios comerciales históricos.

- Al confirmar un producto creado desde una referencia externa, el laboratorio sugerido se vincula si ya existe o se crea dentro de la misma transacción. Seleccionar una referencia por sí solo no crea registros internos.

- Al abrir Productos se preparan de forma idempotente las categorías iniciales (Medicamentos, Dermocosmética, Perfumería, Accesorios, Suplementos e Higiene). Elegir una referencia externa asigna Medicamentos; el operador puede cambiarla antes de guardar.
- La unidad de venta se guarda por producto como caja, blíster o unidad. No se convierten cantidades entre presentaciones hasta definir una equivalencia comercial por producto.

- Los cierres de caja conservan efectivo esperado, contado y diferencia calculados desde el fondo inicial, los cobros en efectivo y los movimientos manuales. El motivo de una diferencia permanece opcional por ahora; el historial y los reportes se consultan por rango, día y mes en horario de Argentina.
- Los productos vinculados explícitamente a una referencia externa se revisan automáticamente a las 09:00 y 17:00 de Argentina (UTC-3). El proceso actualiza únicamente el precio de referencia sugerido y su fecha de comprobación; el precio comercial de venta sigue siendo una decisión manual.

- Cuenta corriente: saldo por cliente y organización, con sucursal de origen en cada movimiento. Crédito deshabilitado por defecto; límite cero no permite nuevas compras. Las ventas financiadas validan el límite dentro de una transacción serializable y no generan vuelto.
- Los cobros admiten efectivo, tarjeta o transferencia; no pueden superar la deuda. Cada recibo tiene una clave idempotente. Efectivo exige caja abierta de la sucursal y registra el ingreso en la misma transacción. Deshabilitar el crédito no impide cobrar saldos anteriores.
- Anular una venta compensa su deuda mediante un crédito, sin borrar movimientos; si ya hubo cobros puede quedar saldo a favor. Las devoluciones físicas conservan su circuito previo de recepción sin reintegro financiero automático.

- En Ventas, seleccionar Cuenta corriente prepara automáticamente el saldo restante como financiación, conserva otros pagos y no duplica el importe al repetir la selección. La venta se registra únicamente al pulsar Confirmar venta; la API mantiene la validación del crédito.

## OPEN

- Credential recovery policy for production.

## DEFERRED

- Docker/WSL execution queda diferido como alternativa de entorno, porque esta computadora usa PostgreSQL nativo para evitar problemas de estabilidad.
- JSON contract for monetary BigInt values is deferred until money is needed.

# Tickets de cobro de cuenta corriente

14/09/2026 (decisión vigente): se recupera RAW V21 con envío directo en un clic, sin vista previa ni diálogo del navegador. Componente administrado por tarea por usuario y supervisor con recuperación; indicador en Gestión. No se reenvían automáticamente resultados inciertos. Esta decisión reemplaza el cambio a HTML registrado abajo; se mantienen encabezado configurable, nombre del empleado y alineaciones corregidas.

14/09/2026: por pedido del usuario se reemplaza la impresión RAW principal por plantilla HTML e impresión del navegador integrada, sin iniciar ni consultar al agente. Se conserva el código RAW como legado. Nombre de quien atiende por organización en UserOrganization.displayName; nunca se imprime el email como fallback. Se retiran los ejemplos personales de los inputs de Organización. Esta decisión reemplaza la dependencia del agente descrita abajo. Ver THERMAL_TICKETS.md.

El encabezado común de tickets se configura en Administración → Organización: nombre del comercio (independiente del nombre administrativo), dirección, ciudad, provincia, CUIT y teléfono. Se guarda en PostgreSQL por organización, con permisos y auditoría. No se rellenan campos vacíos con datos del agente. Se retiran las dos líneas finales de operación/leyenda del papel y la vista previa sin alterar la naturaleza interna ni los identificadores guardados.

La impresión de ventas y cobros se unifica en V21, con agente local Windows RAW ESC/POS en 127.0.0.1:17890 y vista previa compartida. El contrato transporta centavos y consume importes persistidos, sin recalcular precios ni modificar operaciones. Cada envío usa requestId y reserva persistente para impedir repeticiones accidentales. Ver [THERMAL_TICKETS.md](THERMAL_TICKETS.md).

Se reutiliza el formato térmico de ventas (80 mm) para imprimir luego de cobrar y desde Historial. Los nuevos recibos guardan una instantánea inmutable en la auditoría transaccional existente, sin migración; reimprimir no modifica deuda ni caja. Incluyen importes efectivamente aplicados por artículo, no el total original de la venta. Para recibos anteriores sin instantánea no se inventa saldo histórico.
