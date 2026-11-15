# Instalación por ambiente (SISTEMA-106)

Qué instalar en cada equipo y en qué orden. Cada sección remite al documento
que manda en el detalle; acá está el recorrido completo.

| Ambiente                       | Para qué                   | Sección |
| ------------------------------ | -------------------------- | ------- |
| PC de desarrollo (Windows)     | Programar y probar         | 1       |
| PC de desarrollo con Docker    | Probar la imagen de la API | 2       |
| PC de la farmacia              | Usar el sistema e imprimir | 3       |
| Servidor: test (hoy "preprod") | Probar lo último de `main` | 4       |
| Servidor: producción           | Farmacias reales           | 5       |
| Servidor nuevo desde cero      | Mudanza o segundo servidor | 6       |

## 1. PC de desarrollo (Windows)

### Programas

| Programa        | Versión | Instalación (PowerShell)                                                 | Comprobar             |
| --------------- | ------- | ------------------------------------------------------------------------ | --------------------- |
| Git             | actual  | `winget install Git.Git`                                                 | `git --version`       |
| Node.js         | 24      | `winget install OpenJS.NodeJS.LTS` (verificar que sea 24)                | `node -v`             |
| pnpm            | 11      | `corepack enable` y `corepack prepare pnpm@11.0.0 --activate`            | `pnpm -v`             |
| PostgreSQL      | 18      | Instalador de postgresql.org (servicio `postgresql-x64-18`, puerto 5432) | servicio en ejecución |
| OpenSSH y `tar` | Windows | Vienen con Windows 11                                                    | `ssh -V`              |

Abrir una terminal nueva después de instalar para que tome el PATH.

### Proyecto

```powershell
git clone https://github.com/carlospereyra22/sistema-de-gestion-para-farmacia.git
cd sistema-de-gestion-para-farmacia
pnpm install
```

### Base de datos local

Con `psql` (o pgAdmin) como `postgres`, elegir una clave propia:

```sql
CREATE ROLE gestion_dev LOGIN PASSWORD 'ELEGIR_UNA_CLAVE' CREATEDB;
CREATE DATABASE gestion_dev OWNER gestion_dev;
```

`CREATEDB` hace falta para `prisma migrate dev` y para los tests de
integración, que crean esquemas aislados.

### Archivos de entorno (no se versionan)

- `apps/api/.env`, copiando `apps/api/.env.example`: `DATABASE_URL` con la
  clave elegida, `JWT_ACCESS_SECRET` de 32 caracteres o más, y
  `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` (12 o más) para el usuario inicial.
- `apps/web/.env`, copiando `apps/web/.env.example`.

### Esquema y datos iniciales

```powershell
pnpm --filter @gestion/api prisma:generate
pnpm db:migrate
pnpm db:seed
```

### Arrancar

Doble clic en `Iniciar Gestion - Pruebas.cmd` (ver `INICIAR_PRUEBAS.md`) o
`pnpm dev`. Web en `http://localhost:5173`, API en `http://localhost:3000`.
Usar siempre `localhost`, no `127.0.0.1`.

### Comprobación

```powershell
pnpm lint; pnpm typecheck; pnpm test; pnpm build
```

### Opcionales

| Para                              | Qué instalar o configurar                                                                        | Detalle                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Publicar en test o producción     | Clave SSH `%USERPROFILE%\.ssh\oracle-gestion.key` y huella del servidor conocida                 | `PUBLICAR_PRODUCCION.md`, `PREPRODUCCION.md` |
| Crear tarjetas de Trello          | Variables de usuario `TRELLO_API_KEY`, `TRELLO_TOKEN`, `TRELLO_BOARD_ID`                         | skill `crear-tareas-trello`                  |
| Imprimir tickets en la PC         | Impresora térmica de 80 mm y `Iniciar Impresora - Tickets.cmd`                                   | `LOCAL_PRINT_AGENT.md`                       |
| Herramientas del catálogo externo | Python 3 (`winget install Python.Python.3.12`) y la segunda base `catalogo_juncos_external`      | `EXTERNAL_PRODUCT_CATALOG.md`                |
| Abrir PR desde la terminal        | GitHub CLI (`winget install GitHub.cli`); sin ella, se abre desde el enlace de GitHub            | skill `git-equipo`                           |
| Asistentes                        | Claude Code o Codex; ambos leen `AGENTS.md` y `.agents/skills/`. No copiar skills a otra carpeta | `AGENTS.md`                                  |

## 2. PC de desarrollo con Docker

Sólo hace falta para probar la imagen de la API; el desarrollo diario sigue con
`pnpm dev`. Hay dos formas; el equipo usa la primera.

### Opción recomendada: Docker dentro de WSL (sin Docker Desktop)

Es el mismo Docker Engine de Linux que corre en el servidor, sin interfaz ni
servicios extra en Windows: más liviano, sin licencia y más parecido a
producción. Se usa desde la terminal de Ubuntu.

1. Activar virtualización en el BIOS si Windows lo pide.
2. Instalar WSL 2 con Ubuntu, en PowerShell **como administrador**, y reiniciar:
   ```powershell
   wsl --install -d Ubuntu
   ```
   Al abrir Ubuntu por primera vez pide crear un usuario y una clave de Linux.
   Si se instaló con `--no-launch` y nunca se creó un usuario, Ubuntu entra
   como `root`: Docker funciona igual y los pasos 3 y 4 van sin `sudo`.
3. Dentro de Ubuntu, instalar Docker con los mismos comandos de "Instalar
   Docker en el servidor (Ubuntu)" de la sección 5.
4. Sólo en la PC (no en el servidor), para no escribir `sudo` cada vez:
   ```bash
   sudo usermod -aG docker $USER
   ```
   y cerrar y volver a abrir Ubuntu.
5. Comprobar, dentro de Ubuntu:
   ```bash
   docker --version && docker compose version && docker run --rm hello-world
   ```
6. Que git dentro de Ubuntu trate los finales de línea igual que el de Windows
   (sin esto, VS Code conectado a WSL muestra unos 1.600 archivos modificados
   que en realidad no cambiaron):
   ```bash
   git config --global core.autocrlf true
   ```
7. La primera vez, construir la imagen y copiar los datos de `gestion_dev`, en
   PowerShell desde la carpeta del proyecto:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/docker-local.ps1 iniciar -Reconstruir
   powershell -ExecutionPolicy Bypass -File scripts/docker-local.ps1 copiar-datos
   ```
   Desde ahí, el uso diario es con doble clic: ver "Uso diario en la PC" de
   `DOCKER.md`.

A tener en cuenta:

- **Qué corre dónde**: Docker (API, worker y su base) dentro de Ubuntu; Node,
  pnpm, la web y git en Windows. `pnpm` no anda en la terminal de Ubuntu
  ("Permission denied" o "command not found"): usar PowerShell.
- WSL se apaga solo a los pocos segundos de que no le quede nada conectado, y
  los contenedores se detienen con él. `Iniciar Gestion - Docker.cmd` lo
  mantiene encendido; si se levanta a mano, dejar una terminal de Ubuntu
  abierta mientras se prueba.
- Los comandos `docker` se escriben **en la terminal de Ubuntu**, no en
  PowerShell (desde PowerShell: `wsl docker compose ...`).
- Docker arranca solo al abrir Ubuntu. Si dice que no puede conectarse al
  servicio: `sudo systemctl start docker`. Si `systemctl` no funciona, agregar
  en `/etc/wsl.conf` las líneas `[boot]` y `systemd=true`, y ejecutar
  `wsl --shutdown` en PowerShell.
- Construir desde `/mnt/c/` es más lento que en disco de Linux; para esta
  imagen alcanza. No hace falta clonar el repo otra vez dentro de WSL.
- WSL toma memoria mientras está abierto. Se libera con `wsl --shutdown`. Para
  ponerle un tope, crear `%USERPROFILE%\.wslconfig` con `[wsl2]` y
  `memory=4GB`.
- Si `localhost:3000` no responde desde Windows, reiniciar WSL
  (`wsl --shutdown`) y volver a levantar el compose.

### Ver los contenedores desde VS Code

La extensión **Container Tools** (ícono de contenedor en la barra lateral)
muestra contenedores, imágenes y logs. Abierta en la ventana normal de Windows
dice "Failed to connect. Is Docker installed?", porque Docker está dentro de
WSL. Para que lo vea:

1. Instalar la extensión **WSL** de Microsoft en VS Code.
2. `Ctrl+Shift+P` → **WSL: Connect to WSL** y abrir la carpeta
   `/mnt/c/sistema-de-gestion-para-farmacia`.
3. En esa ventana, instalar **Container Tools** cuando ofrece "Install in WSL".

Si la extensión muestra "permission denied ... docker API", el usuario de Linux
no está en el grupo `docker`: hacer el paso 4 de arriba, ejecutar
`wsl --shutdown` en PowerShell y volver a conectar. Si la ventana queda en
"Opening Remote..." después de reiniciar WSL, cerrarla y abrirla de nuevo con
**WSL: Connect to WSL**.

Esa ventana es sólo para manejar Docker. Para programar, correr `pnpm` y hacer
commits se sigue usando la ventana normal de Windows: Node y pnpm están ahí. Si
Source Control de esa ventana muestra cientos de archivos modificados, falta el
paso 6 (`core.autocrlf`).

### Alternativa: Docker Desktop

Más cómodo (interfaz gráfica, `docker` disponible en PowerShell) y más pesado.
También usa WSL 2 por debajo.

1. `wsl --install` como administrador y reiniciar.
2. `winget install Docker.DockerDesktop`; abrirlo una vez y aceptar el motor
   WSL 2.
3. `docker --version` y `docker compose version` en PowerShell.

Pide licencia paga a empresas grandes; para un equipo chico es gratuito.

## 3. PC de la farmacia

No se instala nada de desarrollo.

1. Navegador Chrome o Edge actualizado.
2. Entrar a la dirección del sistema, iniciar sesión e instalar la app desde
   el menú de la cuenta (**Instalar sistema**).
3. Impresión de tickets: descargar el instalador del agente desde la propia
   web cuando lo ofrece y seguir `LOCAL_PRINT_AGENT.md` y
   `PRODUCTION_PRINTING.md`.
4. Modo sin internet: abrir el sistema con conexión al menos una vez por
   usuario en esa PC para que baje la copia local (`OFFLINE.md`).

Si cambia la dirección del sistema (dominio nuevo) hay que repetir los pasos 2
y 4 en cada PC, y **sincronizar antes** las ventas hechas sin conexión.

## 4. Servidor: test (hoy llamado "preprod")

Vive en el mismo VPS que producción, aislado: base `gestion_preprod`, servicio
`gestion-preprod-api`, puerto 3001 y ruta `/preprod/api/v1/`.

- Primera instalación: `Preproduccion.cmd -Provision` (`PREPRODUCCION.md`).
- Publicar: `Publicar Preproduccion.cmd`; la web, a su sitio de Netlify con
  `SUBIR-A-NETLIFY-PREPROD`.
- En Docker: `DOCKER.md`, "Pase del servidor a Docker". Es donde se prueba el
  pase antes de tocar producción.

## 5. Servidor: producción

Estado actual: Ubuntu en Oracle, systemd + nginx + PostgreSQL 18 nativos.

| Paso                                 | Documento                                             |
| ------------------------------------ | ----------------------------------------------------- |
| API, HTTPS por IP, firewall          | `deploy/oracle/README.md`                             |
| Alta de la primera organización      | `PRODUCTION_BOOTSTRAP.md`                             |
| Respaldos y copia fuera del servidor | `deploy/oracle/backups/README.md`                     |
| Facturación electrónica              | `PRODUCTION_FISCAL_CHECKLIST.md`, `FISCAL_BILLING.md` |
| Publicar versiones                   | `PUBLICAR_PRODUCCION.md`, skill `publicar-ambientes`  |
| Web                                  | `NETLIFY.md`                                          |
| Pasar la API a Docker                | `DOCKER.md`                                           |

Nada de producción se ejecuta sin autorización explícita del responsable.

### Instalar Docker en el servidor (Ubuntu)

Con el repositorio oficial de Docker (no el paquete `docker.io` ni snap):

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker --version && docker compose version
```

Notas:

- No agregar `ubuntu` al grupo `docker` (equivale a ser root); usar `sudo`.
- Los contenedores usan la red del servidor y sólo escuchan en loopback: no
  hay que abrir puertos nuevos. Siguen cerrados 3000–3003 y 5432.
- Docker guarda imágenes en `/var/lib/docker`: revisar el disco libre antes
  (cada imagen ronda 1 GB) y limpiar las viejas (`DOCKER.md`).
- La imagen se construye en el servidor, así que sirve tanto en máquinas ARM
  (Ampere) como x86.

## 6. Servidor nuevo desde cero

Para mudarse de Oracle o levantar un segundo servidor. Orden:

1. Ubuntu LTS, usuario `ubuntu`, SSH sólo con clave, firewall con 22, 80 y 443.
2. PostgreSQL 18 (o una base administrada), rol y base del ambiente.
3. nginx y certbot; con dominio propio, certificado del dominio en vez de la IP.
4. Docker (arriba).
5. `/etc/gestion-api/environment` con los secretos y `/etc/gestion-api/docker.env`
   desde `deploy/docker/entorno.ejemplo.env`.
6. Restaurar el último respaldo (`deploy/oracle/backups/README.md`) y, si hay
   facturación, la clave fiscal desde su copia externa
   (`deploy/oracle/backups/PORTABLE_FISCAL_BACKUP.md`).
7. `deploy/docker/actualizar.sh` con la versión a publicar.
8. Respaldos programados en el servidor nuevo y prueba de restauración.
9. Cambiar el DNS (o el proxy de Netlify) hacia el servidor nuevo y comprobar
   sesión, ventas, impresión y estado fiscal.

Los scripts de `deploy/oracle/` tienen rutas e IP de la instancia actual:
revisarlos antes de reutilizarlos en otra máquina.
