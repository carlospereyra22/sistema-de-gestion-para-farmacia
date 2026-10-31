# Agente local de impresión — piloto Windows

## Decisión actual

La comparación en papel rechazó la adaptación al navegador. Se restaura el
transporte RAW local del sistema y se ofrece un instalador descargable cuando
la web no logra comunicarse con el agente. No se activa Cloud V24.

V21 identifica el perfil físico conservado también por el paquete de referencia
V24; no identifica la versión del instalador. El instalador de este repositorio
es **Agente local de Gestión 1.0.5-pilot**, no el Print Box/cola Cloud V24.

Desde 1.0.2 se antepone a cada ticket el comando de densidad 4
`1F 1B 1F 13 14 04`, igual que en la prueba física V24 suministrada.
Antes de esta corrección, el renderer local no enviaba ese comando.
Es un ajuste del perfil Xprinter, no un comando universal para todas las
térmicas ni una modificación del controlador de Windows. No se agrega un
selector de densidad genérico: otros modelos requieren un perfil validado.
Desde 1.0.4, Tickets y comprobantes permite seleccionar niveles 1–8 para
el perfil Xprinter, con 4 por defecto. Se persiste en ticketHeader por
organización, con los permisos y auditoría existentes, y se envía en
store.printDensity tanto en ventas como en cobros al cargar el documento.
API y agente validan el rango; no se cambia ningún otro byte del formato.
Los agentes anteriores requieren actualización para respetar el selector.
La respuesta física y la persistencia del ajuste dependen del firmware;
no se asegura que el valor quede almacenado permanentemente.

## Experiencia de uso

- Imprimir carga el documento persistido y solicita RAW al agente de esta PC.
- Si no conecta, ofrece descargar `/downloads/gestion-impresion-windows.zip`.
  No afirma que esté desinstalado: puede faltar permiso local o estar detenido.
- Extraer el ZIP y abrir **Instalar.vbs**. Se muestra un formulario para elegir
  una impresora instalada en Windows y confirmar la instalación.
- El ZIP incluye runtime Node con firma Authenticode válida y su licencia;
  no necesita instalar Node manualmente ni mantener terminales abiertas.
- El paquete de prueba no tiene firma de editor propia. No eludir bloqueos de
  seguridad corporativos; distribución firmada queda pendiente para producción.
- Regresar a la web y pulsar «Comprobar e imprimir». Un reintento conserva
  su requestId. Otra copia requiere confirmación, sin reenvíos automáticos.
- No hay fallback a la impresión del navegador ni creación de operaciones
  comerciales al instalar. El ACK RAW confirma envío a Windows, no papel físico.
- La descarga se ofrece desde la web con versión en la URL para evitar reutilizar
  un instalador anterior en caché. Se configura el equipo donde se abre el ZIP,
  no el servidor ni la PC de desarrollo. Las nuevas instrucciones y el ZIP deben
  publicarse juntos en Netlify; construir el paquete local no actualiza la web.

## Instalación y recuperación

Destino fijo por usuario: `%LOCALAPPDATA%/GestionPrintAgent`, protegido con ACL
del usuario y SYSTEM. La tarea **Gestion-PrintAgent** se inicia al entrar en la
sesión de Windows, sin elevación. Ejecuta `wscript.exe run.vbs`, que inicia el
supervisor Node oculto y espera su salida. El supervisor recupera su servidor
sin repetir tickets. Windows Script Host debe estar disponible/habilitado.

PowerShell se usa transitoriamente para consultar Windows y enviar RAW, oculto;
no se mantiene una consola de PowerShell como supervisor. Instalar.vbs también
inicia el formulario PowerShell con ventana de consola oculta. Instalar.cmd se
conserva como entrada compatible y sale inmediatamente después de lanzar VBS.

El agente escucha exclusivamente en `127.0.0.1:17890`; valida Host y una lista
exacta de orígenes locales/Netlify, sin comodines. No abrir ese puerto al exterior.
Los navegadores pueden requerir permiso para acceso al equipo local.

Desde 1.0.5 se permite recuperar una instalación incompleta o actualizar la propia,
con confirmación de pausa de impresión y respaldo en una carpeta única de LocalAppData.
Se conservan configuración (salvo la impresora elegida), orígenes e historial.
Sólo se detienen los procesos del runtime y scripts de esa instalación y se reemplaza
su tarea cuando sus rutas coinciden. Se rechazan enlaces, configuración corrupta,
tareas ajenas y puertos ocupados por otro componente. No hay rollback automático
ante errores: se informa el respaldo y puede reintentarse sin borrar el journal.
Se comprueban Spooler, driver registrado, estado sin conexión y `/status` con la
impresora elegida. Se bloquea PDF/XPS/archivo; no se instalan drivers ni se asegura
salida física a partir de estos controles. La web consulta `/status` antes de enviar
para ofrecer recuperación también cuando falta la impresora configurada.

Si existe
la tarea antigua del proyecto, debe estar deshabilitada y se conserva su journal
antes de arrancar. No borrar `.cache/thermal-print-jobs`: contiene protección
contra duplicados. Si una instalación falla después de copiar archivos, revisar
el estado antes de reintentar. La recuperación sólo cubre la instalación propia
por usuario, no instalaciones legacy ambiguas ni políticas restrictivas de Windows.

Diagnóstico: `/status`, tarea programada y logs en `.cache/thermal-agent` del
destino instalado. Para detener, usar la tarea y verificar sus procesos hijos;
no borrar historiales ni terminar todos los procesos Node del equipo.

## Empaquetar

Ejecutar `scripts/agent-installer/build.ps1` en Windows con Node firmado instalado.
Incluye solamente los archivos permitidos, una licencia oficial de la versión de
Node y un manifiesto SHA-256; no incluye configuración local, tickets ni secretos.
El manifiesto detecta corrupción, no reemplaza una firma del instalador.
El ZIP generado se copia a `apps/web/public/downloads` y Vite lo incluye en dist.
Reconstruir el frontend después del instalador; el paquete de preparación anterior
de producción no incluye necesariamente esta versión.

## Evidencia del piloto 20/09/2026

- Navegador: StrictMode carga una vez; un fallo ofrece instalación sin imprimir;
  reintentar explícitamente con agente disponible produce un solo POST RAW simulado.
- Paquete completo, hashes y firma del runtime verificados con `-ValidateOnly`.
- Usuario instaló el primer piloto. Se corrigió su tarea para usar WScript, sin
  borrar configuración/journal. Estado Running y Xprinter XP-80 disponible.
- Copia de la tarea anterior: `.cache/agent-task-before-hidden-20260920.xml`.
- No se envió ningún ticket en las comprobaciones del asistente. Falta validación
  de papel por el usuario, reinicio real de Windows y prueba desde producción.
- El formato está validado para Xprinter XP-80; no se promete compatibilidad con
  todas las térmicas. Otros modelos necesitan verificar comandos, papel y corte.
