# Impresión y despliegue en VPS

## Estado actual

Actualización 20/09/2026: el botón local se adaptó a impresión del navegador, sin
agente, por pedido de usar la térmica/controlador de cada PC. Ver
BROWSER_PRINT_V24.md. Es candidato a prueba física: no se publicó en producción
ni se verificó que el papel sea idéntico al RAW aprobado. Los apartados siguientes
documentan el circuito RAW anterior y sus requisitos, no el nuevo botón local.

La aplicación conserva React/NestJS/PostgreSQL. No se aprobó migrarla a escritorio. El alta del VPS se describe en PRODUCTION_BOOTSTRAP.md; no acredita un despliegue completo ni validación de impresión remota.

La impresión RAW V21 actual utiliza un componente Windows en cada puesto, accesible por loopback. Subir la API al VPS no traslada la impresora USB de la farmacia al servidor. El generador RAW y el helper Winspool no se ejecutan en el VPS Ubuntu.

El supervisor local debe ejecutarse sin consola visible. El wrapper usa Start-Process con WindowStyle Hidden, conserva la tarea activa y registra salida/error en .cache/thermal-agent. Esto corrige el lanzamiento, no elimina la dependencia local ni garantiza recuperación frente a toda terminación externa.

## Condiciones pendientes antes de declarar producción lista

- Definir con el usuario si se mantiene la impresión RAW local o se utiliza impresión del navegador con diálogo. No cambiar a escritorio sin autorización.
- Verificar dominio HTTPS definitivo, configuración API/CORS y orígenes exactos del componente. No habilitar comodines ni exponer el puerto 17890 a Internet.
- Si se mantiene RAW, empaquetar instalación y actualización independiente de la carpeta de desarrollo y su Node, con inicio oculto, diagnóstico y recuperación probada en cada PC.
- Probar desde el dominio real de producción los permisos de acceso local del navegador y la impresora correcta del puesto, con usuario autorizado y datos persistidos.
- Comprobar reinicio de Windows, cierre de ventanas, interrupción del componente, impresora apagada y respuestas perdidas. No reenviar automáticamente trabajos inciertos.
- Validar logo y formato V21 físicamente en ventas y cobros; verificar que reimprimir no cambie stock, caja ni deuda.
- Respaldar base de datos y comprobar migraciones pendientes antes de desplegar; no ejecutar seed demo ni bootstrap sobre una organización existente.

No se ha desplegado ni validado el VPS durante esta corrección local.
