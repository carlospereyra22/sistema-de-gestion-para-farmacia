# API en Docker (SISTEMA-106)

Una sola imagen de la API que corre en varios roles. El porqué está en
`ESCALABILIDAD.md`; la instalación de Docker en cada equipo, en `INSTALACION.md`.

**Estado (14/11/2026)**: archivos y código listos y con tests. La imagen se
construyó y se probó en una PC con Docker dentro de WSL (resultado abajo, en
"Probado"). Producción y test siguen en systemd hasta hacer el pase, con
autorización: los archivos del servidor todavía no se ejecutaron nunca.

## Archivos

| Archivo                                        | Para qué                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/api/Dockerfile`                          | Imagen única (Node 24, Prisma, código compilado). Se construye desde la raíz |
| `.dockerignore`                                | Deja fuera secretos, datos, la web y `node_modules`                          |
| `deploy/docker/compose.prod.yaml`              | Servidor: `api-1`, `api-2`, `worker`, `migrate`, `consola`                   |
| `deploy/docker/compose.custodio-fiscal.yaml`   | Sólo producción: monta la clave maestra de las credenciales de ARCA          |
| `deploy/docker/compose.fiscal-produccion.yaml` | Sólo producción con emisión real: sus dos variables                          |
| `deploy/docker/entorno.ejemplo.env`            | Variables `GESTION_*` del compose (puertos, memoria, conexiones)             |
| `deploy/docker/gestion-api-upstream.nginx`     | nginx repartiendo entre las dos copias                                       |
| `deploy/docker/actualizar.sh`                  | Publicar una versión en el servidor                                          |
| `deploy/docker/compose.local.yaml`             | Probar la imagen en una PC, con base propia y vacía                          |
| `apps/api/src/worker.ts`                       | Proceso de tareas programadas, sin puerto                                    |

## Roles

| Rol              | Comando                       | Tareas programadas | Notas                                                      |
| ---------------- | ----------------------------- | ------------------ | ---------------------------------------------------------- |
| `api-1`, `api-2` | `node /app/entrada/main.js`   | Apagadas           | Puertos loopback 3000 y 3002 (test: 3001 y 3003)           |
| `worker`         | `node /app/entrada/worker.js` | Encendidas         | **Una sola copia**. Precios 09 y 17 h, cola fiscal, cargos |
| `migrate`        | `prisma migrate deploy`       | —                  | Sólo al publicar                                           |
| `consola`        | el que se indique             | Apagadas           | Comandos de servidor                                       |

Las tareas se apagan con las variables que ya existían:
`PRICE_REFRESH_SCHEDULER=off`, `FISCAL_QUEUE_WORKER=off`,
`SUBSCRIPTION_SCHEDULER=off`. Las acciones a pedido (actualizar precios de una
farmacia, enviar una factura desde la web) siguen funcionando en la API.

`/app/entrada` es un enlace que el Dockerfile crea hacia `dist/src` o `dist`,
según dónde Nest deje `main.js`.

## Variables nuevas de la API

| Variable                    | Efecto                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_CONNECTION_LIMIT` | Tope de conexiones a PostgreSQL de ese proceso. Sin ella, Prisma usa núcleos × 2 + 1 |
| `DATABASE_POOL_TIMEOUT`     | Segundos que un pedido espera una conexión libre                                     |

La suma de todos los procesos (2 × API + worker + consola, más test) tiene que
quedar por debajo de `max_connections` de PostgreSQL (100 por defecto). Con los
valores de ejemplo: 10 + 10 + 5 + 3 = 28 por ambiente.

## Uso diario en la PC

Requiere Docker dentro de WSL, instalado una vez (`INSTALACION.md`, sección 2).
La API en Docker usa **su propia base** (dentro de Docker), separada de
`gestion_dev`: lo que se haga en la prueba no toca los datos de desarrollo, y
el worker actualiza precios a las 9 y a las 17 sobre esa copia.

La prueba con Docker **reemplaza** a `Iniciar Gestion - Pruebas.cmd` mientras
está encendida: las dos usan el puerto 3000. Se usa una u otra.

| Cuándo                                    | Qué hacer                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Prender la PC y querer probar con Docker  | Doble clic en **Iniciar Gestion - Docker.cmd**                                                         |
| Terminar o volver al modo de siempre      | Doble clic en **Detener Gestion - Docker.cmd**; después, si se quiere, `Iniciar Gestion - Pruebas.cmd` |
| Se bajaron cambios de la API (`git pull`) | `scripts/docker-local.ps1 iniciar -Reconstruir` (reconstruye la imagen, unos minutos)                  |
| Traer los datos actuales de `gestion_dev` | `scripts/docker-local.ps1 copiar-datos` (reemplaza los datos de la prueba; `gestion_dev` sólo se lee)  |
| Ver si está todo arriba                   | `scripts/docker-local.ps1 estado`                                                                      |
| Apagar la PC                              | Se puede apagar directo. Al prenderla, todo arranca apagado: volver a **Iniciar Gestion - Docker.cmd** |

Los comandos `scripts/docker-local.ps1 ...` se corren en PowerShell desde la
carpeta del proyecto, con `powershell -ExecutionPolicy Bypass -File` adelante.

**Iniciar** comprueba que la API nativa no esté usando el puerto 3000, mantiene
WSL encendido con un proceso oculto, levanta base, migraciones, `api-1`,
`api-2` y `worker`, espera a que respondan, abre la web (`pnpm dev:web`) en otra
ventana de PowerShell y el navegador. **Detener** cierra esa ventana, baja los
contenedores (la base queda guardada) y deja que WSL se apague. No hace falta
cerrar nada a mano.

Se entra con los usuarios de `gestion_dev` si se hizo `copiar-datos`. Con la
base vacía de la primera vez, crear un usuario de ejemplo
(`owner@demo.local` / `clave-de-prueba-local-1234`) desde Ubuntu:

```bash
cd /mnt/c/sistema-de-gestion-para-farmacia
docker compose -f deploy/docker/compose.local.yaml run --rm sembrar
```

Logs, desde Ubuntu o con la extensión de contenedores de VS Code
(`INSTALACION.md`):

```bash
docker compose -f deploy/docker/compose.local.yaml ps -a
docker compose -f deploy/docker/compose.local.yaml logs --since 10m worker
```

**Facturación (ARCA homologación) en la prueba con Docker.** En Windows las
credenciales fiscales de `gestion_dev` se guardan cifradas con DPAPI, atado al
usuario de Windows, y la API en Docker (Linux) no puede abrirlas. Por eso
`copiar-datos` las convierte con `scripts/docker-local-recifrar.cjs`: lee
`gestion_dev` sin modificarla, abre cada valor con DPAPI y lo vuelve a cifrar
con una clave propia de esta PC (`.cache/docker-local/clave-fiscal.env`, se crea
sola y no se versiona), sólo en la copia de Docker. Se convierten, **para cada
farmacia**, la clave privada del certificado y los tickets de acceso vigentes
(si Docker pidiera un ticket nuevo mientras el de la app nativa sigue vigente,
ARCA lo rechazaría); además el certificado del padrón de la plataforma y el
segundo factor del superadmin. Las credenciales de **producción** no se copian:
en la PC no se usan.

Si al facturar en Docker aparece "No se pudo abrir la clave técnica protegida",
volver a correr `copiar-datos`. Si se borra `clave-fiscal.env`, también.

En la PC no hay nginx: la web habla sólo con `api-1` (puerto 3000). Detener
`api-1` hace que la web pase a sin conexión, lo que sirve para probar ese modo.

Qué comprobar:

1. `http://localhost:3000/api/v1/health` y `http://localhost:3002/api/v1/health`
   responden `{"status":"ok","database":"ok"}`.
2. "Próxima actualización de referencias" aparece en los logs de `worker` y
   **no** en los de `api-1` ni `api-2`.
3. Entrar desde la web y hacer una venta.
4. `docker compose -f deploy/docker/compose.local.yaml stop api-1`: el puerto
   3002 sigue respondiendo.
5. Nueve inicios de sesión con una clave equivocada de 12 caracteres o más: el
   noveno responde 429.

Para borrar la base de la prueba y empezar de cero:
`docker compose -f deploy/docker/compose.local.yaml down -v` desde Ubuntu.

## Pase del servidor a Docker

Primero en test (hoy llamado preprod); producción sólo después de probar test,
con autorización explícita y fuera del horario de cobros. Nada de esto lo hace
un agente por su cuenta.

1. **Instalar Docker** en el servidor (`INSTALACION.md`).
2. **Variables del compose**: copiar `deploy/docker/entorno.ejemplo.env` a
   `/etc/gestion-preprod/docker.env` (test: `GESTION_PROYECTO=gestion-preprod`,
   `GESTION_ENTORNO=/etc/gestion-preprod/environment`, puertos 3001 y 3003) o a
   `/etc/gestion-api/docker.env` (producción). Dueño root, permisos 600.
   Confirmar `GESTION_UID`/`GESTION_GID` con `id ubuntu`.
3. **Fiscal (sólo producción)**. Son dos cosas distintas:
   - **Clave maestra** de las credenciales de ARCA: en systemd la configura el
     drop-in `40-fiscal-vault.conf`; en Docker, `compose.custodio-fiscal.yaml`,
     que `actualizar.sh produccion` suma siempre después de correr
     `prepare-fiscal-vault.sh`. Sin ella la API no abre los certificados, ni
     en homologación.
   - **Emisión real**: en systemd la habilita el drop-in
     `60-fiscal-production.conf`. En Docker la habilita
     `compose.fiscal-produccion.yaml`, que `actualizar.sh` suma sólo si existe el
     archivo vacío `/etc/gestion-api/usar-fiscal-produccion`. Crearlo únicamente
     si el drop-in ya estaba instalado. Sin él, la API en Docker arranca con la
     emisión productiva deshabilitada.
4. **nginx**: instalar `gestion-api-upstream.nginx` y cambiar los `proxy_pass`
   como indica ese archivo. `sudo nginx -t` y `sudo systemctl reload nginx`. Se
   puede hacer antes del pase: con una sola copia escuchando, nginx usa esa.
5. **Subir la versión** como hoy (el publicador deja el código en
   `/home/ubuntu/gestion-releases/<id>` o `gestion-preprod-releases/<id>`).
6. **Cambiar de modo** (corte de unos minutos):
   ```bash
   sudo systemctl disable --now gestion-preprod-api      # producción: gestion-api
   sudo bash /home/ubuntu/gestion-preprod-releases/<id>/deploy/docker/actualizar.sh preprod <id>
   ```
7. **Comprobar**: salud en los dos puertos, iniciar sesión desde la web del
   ambiente, logs del `worker`, y en producción el estado fiscal.

`Publicar Produccion.cmd` y `Publicar Preproduccion.cmd` siguen llamando a los
scripts de systemd. Integrarlos a `actualizar.sh` es parte del pase.

## Publicar una versión (ya en Docker)

```bash
sudo bash <carpeta de la versión>/deploy/docker/actualizar.sh <produccion|preprod> <id>
```

Construye la imagen `gestion-api:<id>`, comprueba que las migraciones aplicadas
no cambiaron, respalda (producción: `gestion-backup.service` con restauración
de prueba) y:

- **sin migraciones pendientes**: reinicia `api-1`, espera salud, reinicia
  `api-2`, espera salud, reinicia `worker`. Sin corte.
- **con migraciones pendientes**: detiene todo, migra y arranca. Corte breve.

## Volver atrás

- **A la imagen anterior** (sin migraciones de por medio): el nombre queda en
  `<carpeta de la versión>/imagen-anterior.txt`. Ponerlo en `GESTION_IMAGEN` de
  `docker.env` y `docker compose --env-file ... -f ... up -d`.
- **A systemd**: `docker compose ... down` y
  `sudo systemctl enable --now gestion-api`. El servicio y su carpeta de
  versión no se borran en el pase.
- **La base no se revierte sola**: si una migración ya se aplicó, restaurar el
  respaldo `releases/<id>.dump` es una decisión del responsable.

## Operación diaria

Con `C="docker compose --env-file /etc/gestion-api/docker.env -f <carpeta>/deploy/docker/compose.prod.yaml"`:

| Necesidad                 | Comando                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| Estado                    | `$C ps`                                                                    |
| Logs de un rol            | `$C logs --since 1h worker`                                                |
| Reiniciar una copia       | `$C restart api-1`                                                         |
| Estado de precios         | `$C run --rm consola node /app/entrada/price-refresh.cli.js estado`        |
| Panel de plataforma (CLI) | `$C run --rm consola node /app/entrada/platform/platform-admin.cli.js ...` |
| Limpiar imágenes viejas   | `docker image prune -a --filter "until=720h"` (conservar la anterior)      |

Los logs rotan solos (5 archivos de 10 MB por contenedor).

## Reglas al cambiar esto

Ver la skill `.agents/skills/docker-api/SKILL.md`. En corto: una sola imagen;
toda tarea programada nueva lleva su variable de apagado y se enciende sólo en
el `worker`; ningún secreto en la imagen ni en el repo; nada que escriba en el
disco del contenedor (es de sólo lectura).

## Probado (14/11/2026, PC con Docker 29 en WSL, x86_64)

Con `compose.local.yaml`, base vacía dentro de Docker:

- La imagen se construye (`pnpm install --filter` sin el resto del workspace
  funciona); pesa 1,06 GB.
- `migrate` aplica todas las migraciones sobre una base vacía y termina.
- `api-1` y `api-2` responden salud en 3000 y 3002, también desde Windows.
- Las tareas programadas aparecen sólo en los logs del `worker`.
- Inicio de sesión correcto por las dos copias con el usuario de `sembrar`.
- Límite de login: 8 respuestas 401 y la novena 429.
- El contenedor corre como usuario `node`, con disco de sólo lectura y `/tmp`
  escribible, sin errores.
- Comando de consola (`price-refresh.cli.js estado`) dentro de la imagen.
- Con `api-1` detenida, `api-2` sigue respondiendo.
- Memoria en reposo: unos 120 MB por copia de la API y 80 MB el worker.

Con una copia de `gestion_dev` (`copiar-datos`: 5 farmacias, 291 productos):

- Los datos se copian y siguen ahí después de `detener` e `iniciar`.
- Ventas desde la web en `localhost:5173` contra la API en contenedores.
- ARCA homologación: las credenciales convertidas por `docker-local-recifrar.cjs`
  abren en Docker y la cola fiscal del `worker` obtuvo CAE para los comprobantes
  de Farmacia Juncos - Preproduccion.

## Sin verificar

- `compose.prod.yaml` (red del servidor, archivo de secretos, usuario `ubuntu`,
  clave fiscal montada), `compose.custodio-fiscal.yaml` y
  `compose.fiscal-produccion.yaml`. La combinación de los tres valida con
  `docker compose config`, pero no se levantó contra una clave real.
- `actualizar.sh` completo y la configuración de nginx con dos copias: no se
  ejecutaron en ningún servidor.
- Construcción en ARM (si el servidor de Oracle es Ampere).
- `scripts/probar-sin-conexion.mjs` contra la API en contenedores.
