param([switch]$CheckOnly, [switch]$NoBrowser, [switch]$Stop)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$logDirectory = Join-Path $projectRoot '.cache\inicio-pruebas'
$webUrl = 'http://localhost:5173'
$apiUrl = 'http://localhost:3000/api/v1/health'

function Test-Port([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $task.Wait(800)) { return $false }
        return $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}

function Test-Api {
    try {
        $health = Invoke-RestMethod -Uri $apiUrl -TimeoutSec 3
        return ($health.status -eq 'ok' -and $health.database -eq 'ok')
    } catch { return $false }
}

function Test-Web {
    try {
        $page = Invoke-WebRequest -Uri $webUrl -UseBasicParsing -TimeoutSec 3
        return ($page.StatusCode -eq 200 -and $page.Content -match '/src/main.tsx')
    } catch { return $false }
}

function Start-DevelopmentProcess([string]$Name, [string]$Arguments) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $outputPath = Join-Path $logDirectory "$Name-$stamp.log"
    $errorPath = Join-Path $logDirectory "$Name-$stamp.err.log"
    $process = Start-Process -FilePath $env:ComSpec -ArgumentList ('/d /s /c ""{0}" {1}"' -f $pnpmPath, $Arguments) `
        -WorkingDirectory $projectRoot -WindowStyle Hidden `
        -RedirectStandardOutput $outputPath -RedirectStandardError $errorPath -PassThru
    @{ pid = $process.Id; startTicks = $process.StartTime.ToUniversalTime().Ticks.ToString(); root = $projectRoot } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDirectory "$Name-process.json") -Encoding UTF8
    return $process
}

$mutex = New-Object Threading.Mutex($false, 'Local\SistemaGestionPruebasLauncher')
$acquired = $false
try {
    try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) {
        Write-Host 'La app ya se esta iniciando. Espera a que se abra el navegador.'
        exit 0
    }
    Write-Host 'Sistema de Gestion - Entorno local de pruebas' -ForegroundColor Cyan
    if ($Stop) {
        foreach ($component in @('web', 'api')) {
            $statePath = Join-Path $logDirectory "$component-process.json"
            if (-not (Test-Path -LiteralPath $statePath)) { continue }
            $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
            if ($state.root -ne $projectRoot) { throw 'El proceso registrado pertenece a otra carpeta.' }
            $process = Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
            if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $state.startTicks -and $process.ProcessName -eq 'cmd') {
                & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "No se pudo detener $component." }
            }
        }
        if ((Test-Port 3000) -or (Test-Port 5173)) {
            throw 'Hay una instancia iniciada fuera de este panel. No se detuvo para evitar cerrar procesos ajenos. Cierra esa instancia desde su consola.'
        }
        Write-Host 'App detenida. PostgreSQL sigue encendido.'
        exit 0
    }
    $pnpmPath = (Get-Command pnpm.cmd -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
        throw 'Faltan las dependencias. Es necesario preparar el proyecto con pnpm install.'
    }
    # Nest carga apps/api/.env; una variable heredada tiene prioridad, igual que en Nest.
    $databaseUrl = $env:DATABASE_URL
    if (-not $databaseUrl) {
        $envFile = Join-Path $projectRoot 'apps\api\.env'
        if (-not (Test-Path -LiteralPath $envFile)) { throw 'Falta apps/api/.env para la base de pruebas.' }
        foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8) {
            if ($line -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
                $databaseUrl = $Matches[1].Trim().Trim('"').Trim("'")
                break
            }
        }
    }
    try { $database = [Uri]$databaseUrl } catch { throw 'La conexion local de la base no es valida.' }
    if (-not $database -or $database.Host -notin @('localhost', '127.0.0.1') -or
        $database.AbsolutePath -ne '/gestion_dev' -or $database.Port -ne 5432) {
        throw 'Por seguridad, este boton solo inicia la base local gestion_dev en el puerto 5432. No inicia produccion.'
    }
    if (-not (Test-Port 5432)) {
        throw 'PostgreSQL local no esta encendido. Abri Servicios de Windows e inicia postgresql-x64-18; luego volve a intentar.'
    }
    $apiReady = Test-Api
    $webReady = Test-Web
    if ($CheckOnly) {
        Write-Host "Configuracion local correcta. Base accesible. API lista: $apiReady. Web lista: $webReady."
        exit 0
    }
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    # Puertos fijos, sin recurrir a otra instancia ni conexion de produccion.
    $env:DATABASE_URL = $databaseUrl
    $env:HOST = '127.0.0.1'
    $env:PORT = '3000'
    $env:CORS_ORIGIN = $webUrl
    $env:VITE_API_URL = 'http://localhost:3000/api/v1'
    # Local tests must never reach ARCA production, even with inherited flags.
    $env:FISCAL_LOCAL_TESTING = 'true'
    $env:FISCAL_PRODUCTION_ISSUANCE = 'disabled'
    $env:FISCAL_RECOVERY_VERIFIED = 'no'
    $startedProcesses = @()
    if (-not $apiReady -and -not (Test-Port 3000)) {
        Write-Host 'Iniciando servidor...'
        $startedProcesses += Start-DevelopmentProcess 'api' '--filter @gestion/api dev'
    }
    if (-not $webReady -and -not (Test-Port 5173)) {
        Write-Host 'Iniciando interfaz...'
        $startedProcesses += Start-DevelopmentProcess 'web' '--filter @gestion/web dev --host 127.0.0.1 --port 5173 --strictPort'
    }
    Write-Host 'Esperando a la app y a la base. El primer inicio puede tardar un minuto...'
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    do {
        $apiReady = Test-Api
        $webReady = Test-Web
        if ($apiReady -and $webReady) { break }
        foreach ($process in $startedProcesses) {
            if ($process.HasExited) { throw "Un componente se cerro durante el inicio. Revisa los registros en $logDirectory" }
        }
        Start-Sleep -Seconds 1
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not ($apiReady -and $webReady)) {
        throw "La app no quedo lista. No se cerraron otros procesos. Revisa los registros en $logDirectory"
    }
    try { & (Join-Path $PSScriptRoot 'iniciar-impresora.ps1') } catch { Write-Warning "La app esta lista; revisar impresion: $($_.Exception.Message)" }
    Write-Host 'Lista. Abriendo la app de pruebas...' -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process $webUrl }
} catch {
    Write-Host "No se pudo iniciar: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
