---
name: docker-api
description: Trabajar con la API en contenedores Docker del sistema de farmacia - Dockerfile, compose, roles (api, worker, migrate, consola), tareas programadas, variables de entorno, nginx con dos copias y el script de actualizacion. Usar al tocar apps/api/Dockerfile, .dockerignore, deploy/docker/, apps/api/src/worker.ts, al agregar una tarea programada, una integracion con un sistema externo o una variable de entorno a la API, o cuando el usuario pregunte como construir, probar, publicar o volver atras con Docker.
---

# API en Docker

Documentos que mandan: `docs/DOCKER.md` (operacion), `docs/ESCALABILIDAD.md`
(por que) y `docs/INSTALACION.md` (instalar Docker). Leerlos antes de cambiar algo.

## Modelo

- **Una sola imagen** (`apps/api/Dockerfile`), varios **roles** segun el comando:
  `api-1`/`api-2` (HTTP), `worker` (tareas programadas, sin puerto), `migrate`
  (`prisma migrate deploy`) y `consola` (comandos de servidor).
- Sigue siendo un monolito modular. No crear imagenes ni servicios por modulo:
  `AGENTS.md` prohibe microservicios.
- Etapa 1: PostgreSQL, nginx y certbot son nativos del servidor; los contenedores
  usan `network_mode: host` y escuchan solo en loopback.
- La web no va en contenedores.

## Reglas al cambiar codigo de la API

1. **Tarea programada nueva** (temporizador en `onModuleInit`): tiene que tener una
   variable para apagarla (patron `X_SCHEDULER=off` / `FISCAL_QUEUE_WORKER=off`),
   agregarse apagada en `x-api-entorno` y en `consola` de `compose.prod.yaml`, en
   `x-sin-tareas` de `compose.local.yaml`, apagarse en los `*.cli.ts`, sumarse al
   aviso de `src/worker.ts` y documentarse en `docs/DOCKER.md`. Asi corre solo en
   el `worker`.
2. **Tiene que ser segura con dos copias**: nada de banderas en memoria como unica
   exclusion. Usar un indice unico, `FOR UPDATE` o un bloqueo asesor de PostgreSQL.
3. **Sin estado en memoria entre pedidos** que deba compartirse entre copias
   (sesiones, permisos, colas). Las caches en memoria son solo para datos publicos
   y de pocos minutos.
4. **No escribir en disco**: el contenedor es de solo lectura (`read_only`), salvo
   `/tmp`. Los archivos van a PostgreSQL o, a futuro, a almacenamiento de objetos.
5. **Variable de entorno nueva**: agregarla a `apps/api/.env.example`, a la tabla de
   `docs/DOCKER.md` si cambia segun el rol, y avisar que hay que cargarla en
   `/etc/gestion-api/environment` y `/etc/gestion-preprod/environment`. Nunca un
   secreto en el Dockerfile, el compose ni `entorno.ejemplo.env`.
6. **Comando de servidor nuevo** (`*.cli.ts`): se ejecuta con
   `consola node /app/entrada/<archivo>.js`; agregarlo a la tabla de operacion.
7. **Dependencia nativa nueva**: confirmar que tenga binarios para Linux x64 y
   arm64; si necesita paquetes del sistema, agregarlos a la etapa `base`.
8. **Conexiones**: cada proceso declara `DATABASE_CONNECTION_LIMIT`. Si se agrega un
   rol o una copia, rehacer la cuenta contra `max_connections` (`docs/DOCKER.md`).
9. **Integracion con un sistema externo** (obras sociales, PAMI, recetas
   electronicas, otro validador): seguir el patron de Fiscal/ARCA descripto en
   `docs/ESCALABILIDAD.md`, "Integraciones externas". En corto: sin transaccion
   abierta durante la llamada, tiempo maximo, pendientes guardados en la base y
   reintentos en el `worker`, nunca un servicio aparte.

## Reglas de los archivos de Docker

- Construir siempre desde la raiz: `docker build -f apps/api/Dockerfile -t gestion-api:<id> .`
- Arrancar por `/app/entrada/...`, nunca por `dist/src/...` ni `dist/...`.
- En tiempo de ejecucion no usar `pnpm` (corepack necesita red y disco): llamar a
  `node` directo, por ejemplo `node node_modules/prisma/build/index.js`.
- Finales de linea LF (`.gitattributes` ya los fija para `deploy/docker/` y el
  Dockerfile). Un `.sh` con CRLF falla en el servidor.
- Lo que no debe entrar a la imagen va en `.dockerignore` (secretos, `data/`,
  respaldos, la web).
- `compose.custodio-fiscal.yaml` (clave maestra de las credenciales de ARCA) va
  siempre en produccion; sin el, la API no abre los certificados. En la PC, las
  credenciales de `gestion_dev` estan cifradas con DPAPI de Windows y `copiar-datos`
  las convierte para Docker con `scripts/docker-local-recifrar.cjs`, farmacia por
  farmacia (`docs/DOCKER.md`). Si se agrega una columna cifrada con `CredentialVault`
  o cambia un contexto, actualizar ese script; si no, ARCA deja de andar en la prueba.
- `compose.fiscal-produccion.yaml` es solo de produccion con emision real. No usarlo
  en test ni en una PC, ni activarlo por cuenta propia.
- No borrar `deploy/oracle/`: es el modo systemd vigente y la vuelta atras.

## Probar

Sin Docker en la PC, decirlo en el informe: no se puede dar por probado. Docker
esta dentro de WSL: correr estos comandos en la terminal de Ubuntu desde
`/mnt/c/<carpeta del repo>`, o anteponer `wsl` desde PowerShell.

En la PC, la API **siempre** corre en Docker (desde SISTEMA-111) con el lanzador
(`scripts/docker-local.ps1`, ver `docs/DOCKER.md`, "Uso diario en la PC"):
`iniciar [-Reconstruir]`, `detener`, `estado` y `copiar-datos`. Despues de
cambiar `apps/api`, reconstruir con `iniciar -Reconstruir` antes de probar desde la
web. `copiar-datos` reemplaza la base de Docker: solo si el usuario lo pide. Si se cambia el compose local o el flujo, actualizar
ese script y esa seccion. A mano, desde Ubuntu:

```powershell
docker compose -f deploy/docker/compose.local.yaml up -d --build
docker compose -f deploy/docker/compose.local.yaml run --rm sembrar
docker compose -f deploy/docker/compose.local.yaml ps
docker compose -f deploy/docker/compose.local.yaml logs worker
docker compose -f deploy/docker/compose.local.yaml down
```

Usa una base propia dentro de Docker; no toca `gestion_dev`. Comprobar la lista
"Que comprobar" de `docs/DOCKER.md`: salud en 3000 y 3002, tareas solo en el
`worker`, venta desde la web, una copia detenida y la otra respondiendo.

Ademas, como en cualquier cambio de la API: skill `cerrar-tarea`.

## Servidor

- Publicar: `sudo bash <version>/deploy/docker/actualizar.sh <produccion|preprod> <id>`.
  Primero test (hoy llamado preprod), despues produccion.
- Un agente **no** ejecuta nada en el servidor, ni el pase de systemd a Docker, ni
  cambios de nginx, sin autorizacion explicita del usuario (`AGENTS.md`).
- Con migraciones pendientes hay pausa. Para publicar sin corte, la migracion tiene
  que ser compatible con la version anterior: agregar columnas o tablas en una
  version y quitar lo viejo en la siguiente (skill `migracion-prisma`).
- Vuelta atras: `docs/DOCKER.md`, "Volver atras". La base nunca se revierte sola.

## Al terminar

Actualizar `docs/DOCKER.md` (y su lista "Sin verificar" si algo se probo o quedo
sin probar) y seguir `cerrar-tarea`.
