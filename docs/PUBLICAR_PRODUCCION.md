# Publicar desde Windows

Los informes fechados de publicaciones anteriores se archivaron en
`%LOCALAPPDATA%/FarmaciaJuncos/RespaldosLocales/catalogo-retirado/docs`.
Este documento conserva el procedimiento vigente. Último registro archivado,
23/10/2026: backend `20261023-150547-a1533402`, respaldo remoto verificado
`/var/backups/gestion/releases/20261023-150547-a1533402.dump`. En esa comprobación
la web de Netlify todavía requería subir la carpeta preparada; ese registro no
confirma el estado actual ni autoriza otra publicación. Nunca subir los datos de
`data/external-catalog`, respaldos o credenciales como archivos del sitio.

El despliegue ahora conserva una clave fiscal externa existente o prepara una
clave maestra AES en /etc/gestion-fiscal/vault.key, separada de PostgreSQL.
No imprime la clave ni la incluye en archivos públicos. El respaldo local en
/var/backups/gestion-secrets/fiscal-vault.key requiere además copia externa
protegida y prueba de recuperación antes de habilitar emisión real.

Para ejecución operada por un administrador con publicación ya autorizada,
-NonInteractive omite únicamente los diálogos y la apertura del Explorador;
conserva respaldos, validaciones, migraciones y verificaciones. No usarlo para
evitar la coordinación de la pausa con quienes están cobrando.

Abrir **Publicar Produccion.cmd** en la raíz del proyecto y confirmar. Se abre
una ventana temporal de progreso; al terminar no queda un servicio local nuevo.
Hacerlo fuera del horario de cobros: las migraciones requieren una pausa de API.

El lanzador:

1. Toma una copia separada del código actual, incluso cambios sin commit.
2. Instala con lockfile, genera Prisma y ejecuta lint, typecheck, tests y build.
3. Reconstruye el instalador del agente y el frontend con `VITE_API_URL=/api/v1`.
4. Sube un archivo con checksum al VPS, sin `.env`, claves, base local o seed.
5. Compila el backend en Linux en `/home/ubuntu/gestion-releases/<id>`.
   Detecta la entrada real (`dist/main.js` o `dist/src/main.js`) y usa esa misma
   ruta al activar systemd. Si falta o es ambigua, se detiene antes del respaldo
   y las migraciones.
6. Comprueba que las migraciones ya aplicadas no hayan cambiado.
7. Ejecuta el respaldo existente, incluida restauración en base temporal, y
   conserva una copia exclusiva en `/var/backups/gestion/releases/<id>.dump`.
8. Detiene la API, ejecuta únicamente `prisma migrate deploy`, cambia un drop-in
   de systemd y arranca la nueva versión. Conserva el entorno secreto existente.
9. Verifica API y base localmente y por HTTPS. Solo entonces reemplaza
   `SUBIR-A-NETLIFY`, conservando la carpeta anterior en la entrega local.

Después, arrastrar **SUBIR-A-NETLIFY** al despliegue manual del **sitio existente
sistema-de-gestion22** en Netlify. No crear otro sitio y no subir el repositorio.
Netlify sigue siendo manual: el botón publica el backend, no el frontend.
Verificar sesión, ventas/historial, Organización e impresión desde el sitio real.
No hacer ventas ficticias para verificar producción.

## Requisitos

Windows con Node firmado, pnpm, OpenSSH y tar; clave existente
`%USERPROFILE%\.ssh\oracle-gestion.key` y huella SSH conocida. El VPS debe conservar
los servicios `gestion-api` y `gestion-backup`, sudo no interactivo, Node/pnpm,
PostgreSQL y HTTPS. No se cambian credenciales, firewall ni Nginx.

La impresión publicada es el agente local, no activa Cloud V24. Incluir un
instalador nuevo no actualiza automáticamente los agentes ya instalados en otras
PC: esos equipos requieren actualización compatible antes de usar funciones nuevas.

## Errores y recuperación

- Hay bloqueo local y remoto contra despliegues simultáneos.
- Registro local: `.cache/production/<id>/publication.log`.
- Registro remoto: `sudo journalctl -u gestion-deploy-<id>`.
- La tarea remota continúa si se corta SSH. Revisar su estado y `DEPLOYED_OK`
  antes de intentar otro despliegue; no asumir que falló o que terminó.
- Antes de las migraciones, un error deja la API anterior activa.
- Desde que comienza la migración, un error puede dejar la API detenida o sin
  salud. Se requiere revisión técnica; el botón no inventa una reversión segura.
- No hay rollback automático de base: restaurar un dump puede perder operaciones
  posteriores. Volver al código anterior tampoco garantiza compatibilidad con
  migraciones nuevas. Se conserva su ruta en `previous-working-directory.txt`.
- Entregas y respaldos por despliegue no se eliminan automáticamente. Revisar
  espacio periódicamente; son distintos de la retención de backups diarios.
- No subir una carpeta anterior si el lanzador informa error.

## Prueba sin publicar

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publicar-produccion.ps1 -PrepareOnly`

Ejecuta la preparación completa en una copia aislada, sin conectar al VPS ni
reemplazar SUBIR-A-NETLIFY. No sustituye una prueba real de despliegue.
Las pruebas de esta copia son las de src y de impresión; no se copian ni ejecutan
los escenarios de apps/api/test que requieren una base de integración.
