# Abrir la app de pruebas en Windows

Hacé doble clic en **Iniciar Gestion - Pruebas.cmd**, en la carpeta del proyecto. Abre un panel de escritorio con el estado de la app y botones **Iniciar gestión**, **Detener**, **Abrir en el navegador** y **Ver registros**. Iniciar espera a que la interfaz y la API/base estén listas; el navegador se abre desde su botón. Los servidores quedan en segundo plano. Cerrar el panel o el navegador no los apaga: usá Detener. Al reiniciar Windows, volvé a usar el archivo.

El panel usa WPF de Windows y PowerShell, sin dependencias nuevas. Las comprobaciones HTTP y las operaciones largas no bloquean la ventana. Detener pide confirmación, conserva PostgreSQL y termina únicamente los árboles de procesos registrados por el lanzador, comprobando PID, fecha de inicio, tipo de proceso y carpeta del proyecto. No busca ni mata todos los procesos Node ni termina procesos desconocidos por puerto. Si encuentra una instancia externa, informa la limitación. Al detener se interrumpe el servicio de pruebas; terminá las operaciones y guardá tu trabajo antes.

Si ya estaba funcionando, vuelve a abrirla sin iniciar otra instancia. Podés crear un acceso directo en el escritorio: clic derecho sobre el archivo → Enviar a → Escritorio (crear acceso directo). No muevas el archivo original fuera del proyecto.

Solo permite PostgreSQL local `gestion_dev`, puerto 5432. La instancia de este equipo usa el servicio automático `postgresql-x64-18`. Si el servicio está apagado, el lanzador informa cómo iniciarlo, sin pedir elevación ni modificar servicios. Requiere las dependencias y `apps/api/.env` ya preparados. No instala paquetes, no migra, no ejecuta seed y no borra datos. Arrancar la API también activa los trabajos programados habituales, sobre la base de pruebas.

Los registros de cada arranque se guardan en `.cache/inicio-pruebas/`. Si un puerto está ocupado, espera a que la instancia existente esté lista; no mata procesos ni usa puertos alternativos. En caso de error la ventana permanece abierta. La comprobación de la interfaz espera la página Vite de desarrollo del proyecto.

Diagnóstico sin iniciar procesos ni abrir navegador:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/iniciar-pruebas.ps1 -CheckOnly
```

Para verificar el inicio sin abrir el navegador, usá `-NoBrowser` (sí puede iniciar los servidores). No es un instalador ni un lanzador de producción.
