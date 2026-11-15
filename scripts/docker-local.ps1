# Prueba local de la API en Docker (SISTEMA-106). Uso desde la raíz del repo:
#
#   powershell -ExecutionPolicy Bypass -File scripts/docker-local.ps1 iniciar
#   powershell -ExecutionPolicy Bypass -File scripts/docker-local.ps1 iniciar -Reconstruir
#   powershell -ExecutionPolicy Bypass -File scripts/docker-local.ps1 detener
#   powershell -ExecutionPolicy Bypass -File scripts/docker-local.ps1 estado
#   powershell -ExecutionPolicy Bypass -File scripts/docker-local.ps1 copiar-datos
#
# O con doble clic: "Iniciar Gestion - Docker.cmd" y "Detener Gestion - Docker.cmd".
#
# Docker corre dentro de WSL (Ubuntu); Node, pnpm y la web, en Windows. WSL se
# apaga solo cuando no le queda ningún proceso de Windows conectado: este script
# deja uno oculto mientras la prueba está encendida y lo cierra al detener.
#
# No toca la base gestion_dev salvo para LEERLA en copiar-datos. No es para
# producción. Ver docs/DOCKER.md, "Uso diario en la PC".

param(
  [Parameter(Position = 0)]
  [ValidateSet("iniciar", "detener", "estado", "copiar-datos")]
  [string]$Accion = "estado",
  [string]$Distro = "Ubuntu",
  [switch]$Reconstruir,
  [switch]$SinNavegador
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$compose = "deploy/docker/compose.local.yaml"
$carpeta = Join-Path $raiz ".cache\docker-local"
$archivoWsl = Join-Path $carpeta "wsl-encendido.pid"
$archivoWeb = Join-Path $carpeta "web.pid"
New-Item -ItemType Directory -Force $carpeta | Out-Null

function Escribir([string]$texto, [string]$color = "Gray") {
  Write-Host $texto -ForegroundColor $color
}

function Fallar([string]$texto) {
  Write-Host ""
  Write-Host $texto -ForegroundColor Red
  exit 1
}

# Corre un comando docker dentro de WSL, en la carpeta del repo.
function Docker([string[]]$argumentos) {
  # La salida va a la pantalla; la función devuelve sólo el código de salida.
  & wsl.exe -d $Distro --cd $raiz -- docker @argumentos | Out-Host
  return $LASTEXITCODE
}

function Compose([string[]]$argumentos) {
  return (Docker (@("compose", "-f", $compose) + $argumentos))
}

function ProcesoVivo([string]$archivo) {
  if (-not (Test-Path $archivo)) { return $null }
  $id = Get-Content $archivo -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $id) { return $null }
  return Get-Process -Id ([int]$id) -ErrorAction SilentlyContinue
}

function ApiResponde([int]$puerto) {
  try {
    $respuesta = Invoke-WebRequest "http://localhost:$puerto/api/v1/health" -UseBasicParsing -TimeoutSec 3
    return $respuesta.Content -match '"database":"ok"'
  } catch { return $false }
}

function WebResponde {
  try {
    Invoke-WebRequest "http://localhost:5173" -UseBasicParsing -TimeoutSec 3 | Out-Null
    return $true
  } catch { return $false }
}

# Dueño del puerto 3000: si es node.exe, es la API nativa de Windows.
function DuenoDelPuerto3000 {
  $conexion = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conexion) { return $null }
  return (Get-Process -Id $conexion.OwningProcess -ErrorAction SilentlyContinue).ProcessName
}

function ComprobarWsl {
  $lista = (& wsl.exe -l -q) -join "`n" -replace "`0", ""
  if ($lista -notmatch "(?m)^$([regex]::Escape($Distro))\s*$") {
    Fallar "No está instalado '$Distro' en WSL. Ver docs/INSTALACION.md, sección 2."
  }
  & wsl.exe -d $Distro -- docker version --format "{{.Server.Version}}" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Fallar ("Docker no responde dentro de $Distro. Abrí Ubuntu y probá 'docker ps'. " +
      "Si dice 'permission denied': sudo usermod -aG docker `$USER y después wsl --shutdown.")
  }
}

function MantenerWslEncendido {
  if (ProcesoVivo $archivoWsl) { return }
  $proceso = Start-Process wsl.exe -ArgumentList @("-d", $Distro, "--", "sleep", "infinity") `
    -WindowStyle Hidden -PassThru
  Set-Content $archivoWsl $proceso.Id
}

function Iniciar {
  Escribir "== Iniciar la prueba con Docker ==" "Cyan"
  $dueno = DuenoDelPuerto3000
  if ($dueno -eq "node") {
    Fallar ("El puerto 3000 lo usa la API nativa (Iniciar Gestion - Pruebas.cmd o pnpm dev). " +
      "Detenela primero: las dos usan el mismo puerto.")
  }
  ComprobarWsl
  MantenerWslEncendido

  Escribir "Levantando base, migraciones, dos copias de la API y worker..."
  $argumentos = @("up", "-d")
  if ($Reconstruir) {
    Escribir "Reconstruyendo la imagen con el código actual (puede tardar unos minutos)..." "Yellow"
    $argumentos += "--build"
  }
  if ((Compose $argumentos) -ne 0) { Fallar "docker compose up falló. Mirá el mensaje de arriba." }

  Escribir "Esperando que la API responda..."
  $lista = $false
  for ($i = 0; $i -lt 60; $i++) {
    if ((ApiResponde 3000) -and (ApiResponde 3002)) { $lista = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $lista) {
    Fallar "La API no respondió en 2 minutos. Ver: wsl docker compose -f $compose logs api-1"
  }
  Escribir "API lista en http://localhost:3000 y http://localhost:3002" "Green"

  if (WebResponde) {
    Escribir "La web ya estaba corriendo en http://localhost:5173" "Green"
  } else {
    Escribir "Abriendo la web (pnpm dev:web) en otra ventana. No la cierres mientras probás."
    $comando = "`$Host.UI.RawUI.WindowTitle = 'Web - Gestion (Docker)'; pnpm dev:web"
    $web = Start-Process powershell.exe -ArgumentList @("-NoExit", "-Command", $comando) `
      -WorkingDirectory $raiz -PassThru
    Set-Content $archivoWeb $web.Id
    for ($i = 0; $i -lt 60; $i++) {
      if (WebResponde) { break }
      Start-Sleep -Seconds 1
    }
  }
  if (-not $SinNavegador) { Start-Process "http://localhost:5173" }
  Escribir ""
  Escribir "Listo. Para apagar: Detener Gestion - Docker.cmd" "Green"
}

function Detener {
  Escribir "== Detener la prueba con Docker ==" "Cyan"
  $web = ProcesoVivo $archivoWeb
  if ($web) {
    Escribir "Cerrando la ventana de la web..."
    & taskkill.exe /T /F /PID $web.Id | Out-Null
  }
  Remove-Item $archivoWeb -ErrorAction SilentlyContinue
  Escribir "Deteniendo los contenedores (los datos de la base quedan guardados)..."
  Compose @("down") | Out-Null
  $wsl = ProcesoVivo $archivoWsl
  if ($wsl) { Stop-Process -Id $wsl.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item $archivoWsl -ErrorAction SilentlyContinue
  Escribir "Detenido. WSL se apaga solo en unos segundos." "Green"
}

function Estado {
  Escribir "== Estado de la prueba con Docker ==" "Cyan"
  Escribir ("API 3000:  " + $(if (ApiResponde 3000) { "responde" } else { "no responde" }))
  Escribir ("API 3002:  " + $(if (ApiResponde 3002) { "responde" } else { "no responde" }))
  Escribir ("Web 5173:  " + $(if (WebResponde) { "responde" } else { "no responde" }))
  Escribir ("WSL encendido por el script: " + $(if (ProcesoVivo $archivoWsl) { "sí" } else { "no" }))
  Compose @("ps", "-a") | Out-Null
}

# Copia gestion_dev a la base de Docker. gestion_dev sólo se lee.
function CopiarDatos {
  Escribir "== Copiar los datos de gestion_dev a la base de Docker ==" "Cyan"
  $pgDump = (Get-Command pg_dump.exe -ErrorAction SilentlyContinue).Source
  if (-not $pgDump) {
    $pgDump = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $pgDump) { Fallar "No encontré pg_dump.exe (viene con PostgreSQL de Windows)." }

  $env_ = Join-Path $raiz "apps\api\.env"
  if (-not (Test-Path $env_)) { Fallar "Falta apps/api/.env." }
  $linea = Get-Content $env_ | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if (-not $linea) { Fallar "apps/api/.env no tiene DATABASE_URL." }
  $url = [Uri](($linea -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'"))
  $base = $url.AbsolutePath.TrimStart('/')
  if ($base -ne "gestion_dev" -or @("localhost", "127.0.0.1") -notcontains $url.Host) {
    Fallar "Por seguridad sólo se copia gestion_dev de esta PC (localhost). La URL apunta a otra base."
  }
  $credenciales = $url.UserInfo.Split(':', 2)
  $usuario = [Uri]::UnescapeDataString($credenciales[0])
  $puerto = if ($url.Port -gt 0) { $url.Port } else { 5432 }

  ComprobarWsl
  MantenerWslEncendido

  $copia = Join-Path $carpeta "gestion_dev.dump"
  Escribir "Leyendo gestion_dev (no se modifica)..."
  $anterior = $env:PGPASSWORD
  try {
    if ($credenciales.Count -gt 1) { $env:PGPASSWORD = [Uri]::UnescapeDataString($credenciales[1]) }
    & $pgDump --format=custom --schema=public --no-owner --no-acl `
      --host $url.Host --port $puerto --username $usuario --dbname $base --file $copia
    if ($LASTEXITCODE -ne 0) { Fallar "pg_dump falló." }
  } finally {
    $env:PGPASSWORD = $anterior
  }

  Escribir "Preparando la base de Docker..."
  if ((Compose @("up", "-d", "--wait", "db")) -ne 0) { Fallar "No arrancó la base de Docker." }
  Compose @("stop", "api-1", "api-2", "worker") | Out-Null

  Escribir "Cargando la copia en la base de Docker (reemplaza lo que tenía)..."
  $wslCopia = "/mnt/" + $copia.Substring(0, 1).ToLower() + ($copia.Substring(2) -replace '\\', '/')
  $restaurar = "docker compose -f $compose exec -T db pg_restore -U gestion_docker -d gestion_docker " +
    "--clean --if-exists --no-owner --no-acl --single-transaction < '$wslCopia'"
  & wsl.exe -d $Distro --cd $raiz -- bash -c $restaurar | Out-Host
  if ($LASTEXITCODE -ne 0) { Fallar "pg_restore falló. La base de Docker quedó como estaba." }
  Remove-Item $copia -ErrorAction SilentlyContinue

  # Las credenciales de ARCA de gestion_dev están cifradas con DPAPI (Windows):
  # se pasan a la clave propia de Docker en esta PC para que la facturación de
  # homologación funcione también en la prueba. Ver docs/DOCKER.md.
  Escribir "Convirtiendo las credenciales fiscales para Docker..."
  $sql = Join-Path $carpeta "credenciales.sql"
  & node (Join-Path $raiz "scripts\docker-local-recifrar.cjs") $sql
  if ($LASTEXITCODE -ne 0) {
    Escribir "No se pudieron convertir: ARCA no va a funcionar en la prueba con Docker." "Yellow"
  } else {
    $wslSql = "/mnt/" + $sql.Substring(0, 1).ToLower() + ($sql.Substring(2) -replace '\\', '/')
    $aplicar = "docker compose -f $compose exec -T db psql -q -U gestion_docker -d gestion_docker " +
      "-v ON_ERROR_STOP=1 --single-transaction < '$wslSql'"
    & wsl.exe -d $Distro --cd $raiz -- bash -c $aplicar | Out-Host
    if ($LASTEXITCODE -ne 0) {
      Escribir "No se pudieron cargar: ARCA no va a funcionar en la prueba con Docker." "Yellow"
    }
  }
  Remove-Item $sql -ErrorAction SilentlyContinue

  Escribir "Arrancando la API..."
  Compose @("up", "-d") | Out-Null
  Escribir "Listo: la base de Docker tiene una copia de gestion_dev. Se entra con los usuarios de siempre." "Green"
}

switch ($Accion) {
  "iniciar" { Iniciar }
  "detener" { Detener }
  "estado" { Estado }
  "copiar-datos" { CopiarDatos }
}
