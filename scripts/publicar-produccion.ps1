param([switch]$PrepareOnly, [switch]$NonInteractive)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$stage = Join-Path $project ('.cache\production\' + $releaseId)
$source = Join-Path $stage 'source'
$target = Join-Path $project 'SUBIR-A-NETLIFY'
$key = Join-Path $env:USERPROFILE '.ssh\oracle-gestion.key'
$remote = 'ubuntu@163.176.241.51'
$remoteRelease = '/home/ubuntu/gestion-releases/' + $releaseId
$lock = $null
$transcribing = $false
$previousApi = $env:VITE_API_URL
function Run([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Fallo $Program (codigo $LASTEXITCODE). No continuar manualmente sin revisar el registro." }
}
function Assert-PlainDirectory([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        if ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "No se permiten enlaces: $Path" }
    }
}
function Copy-SourceTree([string]$Relative) {
    $origin = Join-Path $project $Relative
    Assert-PlainDirectory $origin
    foreach ($item in Get-ChildItem -LiteralPath $origin -Recurse -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Enlace inesperado en fuentes: $($item.FullName)" }
        if ($item.PSIsContainer) { continue }
        if ($Relative -eq 'scripts\thermal-agent' -and $item.Name -eq 'config.json') { continue }
        if ($item.Name -like '.env*' -or $item.Extension -in @('.key','.pem','.dump','.log')) { throw 'Archivo privado inesperado dentro de las fuentes.' }
        $relativeFile = $item.FullName.Substring($project.Length + 1)
        $destination = Join-Path $source $relativeFile
        New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $item.FullName -Destination $destination
    }
}
try {
    Add-Type -AssemblyName System.Windows.Forms
    if (-not $PrepareOnly -and -not $NonInteractive) {
        $answer = [Windows.Forms.MessageBox]::Show('Se verificara y publicara el backend en el VPS, con respaldo y una pausa breve del servicio. Al terminar se preparara SUBIR-A-NETLIFY. No usar mientras estan cobrando. Continuar?', 'Publicar produccion', 'YesNo', 'Warning')
        if ($answer -ne 'Yes') { exit 0 }
    }
    foreach ($command in @('pnpm.cmd','node.exe','tar.exe','ssh.exe','scp.exe')) { Get-Command $command -ErrorAction Stop | Out-Null }
    if (-not $PrepareOnly -and -not (Test-Path -LiteralPath $key -PathType Leaf)) { throw 'Falta la clave SSH de Oracle. No se genero ninguna clave nueva.' }
    Assert-PlainDirectory (Join-Path $project '.cache')
    New-Item -ItemType Directory -Path (Join-Path $project '.cache\production') -Force | Out-Null
    Assert-PlainDirectory (Join-Path $project '.cache\production')
    $lock = [IO.File]::Open((Join-Path $project '.cache\production\publish.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    Start-Transcript -Path (Join-Path $stage 'publication.log') | Out-Null
    $transcribing = $true
    Write-Host "PREPARANDO $releaseId"
    # Lista cerrada: nunca copiar .env, node_modules, bases locales ni claves.
    foreach ($file in @('package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.prettierignore','.gitignore','.editorconfig')) {
        Copy-Item -LiteralPath (Join-Path $project $file) -Destination (Join-Path $source $file)
    }
    foreach ($app in @('apps\api','apps\web','packages\contracts')) {
        New-Item -ItemType Directory -Path (Join-Path $source $app) -Force | Out-Null
        foreach ($file in Get-ChildItem -LiteralPath (Join-Path $project $app) -File) {
            if ($file.Name -eq 'package.json' -or $file.Name -like 'tsconfig*.json' -or $file.Name -in @('eslint.config.mjs','eslint.config.js','jest.config.cjs','nest-cli.json','vite.config.ts','index.html','components.json')) {
                Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $source $app)
            }
        }
        Copy-SourceTree ($app + '\src')
    }
    foreach ($tree in @('docs','apps\api\prisma\migrations','apps\web\public','scripts\thermal-agent','scripts\print-box','scripts\agent-installer','deploy\oracle')) { Copy-SourceTree $tree }
    # config.json del agente se excluye: es propio de la PC, no de produccion.
    # Configuracion de pruebas sin secretos; los tests sustituyen el envio RAW.
    Copy-Item -LiteralPath (Join-Path $source 'deploy\oracle\agent-test-config.json') -Destination (Join-Path $source 'scripts\thermal-agent\config.json')
    Copy-Item -LiteralPath (Join-Path $project 'apps\api\prisma\schema.prisma') -Destination (Join-Path $source 'apps\api\prisma\schema.prisma')
    Push-Location $source
    try {
        Run 'pnpm.cmd' @('install','--frozen-lockfile')
        Run 'pnpm.cmd' @('--filter','@gestion/api','prisma:generate')
        Run 'pnpm.cmd' @('lint')
        Run 'pnpm.cmd' @('typecheck')
        Run 'pnpm.cmd' @('test')
        Run 'node.exe' @('--test','deploy/oracle/check-migrations.test.cjs','deploy/oracle/api-entry.test.cjs')
        Run 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $source 'scripts\agent-installer\build.ps1'))
        $env:VITE_API_URL = '/api/v1'
        Run 'pnpm.cmd' @('build')
        Run 'node.exe' @('deploy/oracle/api-entry.cjs')
        $frontend = Join-Path $source 'apps\web\dist'
        if (-not (Test-Path -LiteralPath (Join-Path $frontend 'index.html'))) { throw 'Falta index.html.' }
        $redirects = Get-Content -LiteralPath (Join-Path $frontend '_redirects') -Raw
        if (-not $redirects.Contains('/api/v1/* https://163.176.241.51/api/v1/:splat 200!')) { throw 'Proxy Netlify inesperado.' }
        foreach ($file in Get-ChildItem -LiteralPath $frontend -Recurse -File) {
            if ($file.Name -like '.env*' -or $file.Extension -in @('.key','.pem','.dump')) { throw 'Archivo privado en frontend.' }
        }
        $ready = Join-Path $stage 'netlify-ready'
        Copy-Item -LiteralPath $frontend -Destination $ready -Recurse
        $archive = Join-Path $stage 'backend.tar.gz'
        Run 'tar.exe' @('-czf',$archive,'--exclude=node_modules','--exclude=dist','--exclude=*.tsbuildinfo','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','apps/api','packages/contracts','deploy/oracle')
    } finally { Pop-Location }
    if ($PrepareOnly) {
        Write-Host "PREPARACION OK: $frontend"
        Write-Host 'No se contacto ni modifico produccion. SUBIR-A-NETLIFY no se reemplazo.'
        exit 0
    }
    $sshArgs = @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-i',$key)
    Run 'ssh.exe' ($sshArgs + @($remote,"umask 027; mkdir -p /home/ubuntu/gestion-releases; mkdir '$remoteRelease'"))
    Run 'scp.exe' ($sshArgs + @($archive,($remote + ':' + $remoteRelease + '/backend.tar.gz')))
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host 'Actualizando VPS. Puede tardar varios minutos. El proceso remoto continua aunque se corte SSH.'
    Run 'ssh.exe' ($sshArgs + @($remote,"set -eu; cd '$remoteRelease'; echo '$hash  backend.tar.gz' | sha256sum -c -; tar -xzf backend.tar.gz; sed -i 's/\r$//' deploy/oracle/update-release.sh; sudo -n systemd-run --unit=gestion-deploy-$releaseId --wait --collect --property=Type=oneshot /bin/bash '$remoteRelease/deploy/oracle/update-release.sh' '$releaseId' || { sudo -n journalctl -u gestion-deploy-$releaseId --no-pager -n 100; exit 1; }; sudo -n journalctl -u gestion-deploy-$releaseId --no-pager -n 100; test -f '$remoteRelease/DEPLOYED_OK'"))
    $health = Invoke-RestMethod -Uri 'https://163.176.241.51/api/v1/health' -TimeoutSec 20
    if ($health.status -ne 'ok' -or $health.database -ne 'ok') { throw 'El backend no paso la comprobacion HTTPS externa.' }
    # Solo despues de verificar el backend reemplazamos la carpeta publica.
    Assert-PlainDirectory $target
    if ((Split-Path $target -Parent) -ne $project -or (Split-Path $target -Leaf) -ne 'SUBIR-A-NETLIFY') { throw 'Destino inesperado.' }
    if (Test-Path -LiteralPath $target) {
        Move-Item -LiteralPath $target -Destination (Join-Path $stage 'netlify-anterior')
    }
    Move-Item -LiteralPath $ready -Destination $target
    Write-Host "PUBLICACION BACKEND OK. SUBIR A NETLIFY: $target"
    if (-not $NonInteractive) {
        [Windows.Forms.MessageBox]::Show("Backend actualizado. Arrastra la carpeta SUBIR-A-NETLIFY al despliegue manual del sitio existente sistema-de-gestion22 en Netlify. La web no se publica automaticamente. Registro: $stage", 'Backend listo', 'OK', 'Information') | Out-Null
        Start-Process explorer.exe -ArgumentList ('"' + $target + '"')
    }
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host "No subas una carpeta anterior a Netlify. Revisa: $stage"
    Write-Host 'Si fallo despues de las migraciones, puede requerir recuperar la API manualmente. No restaurar datos automaticamente.'
    exit 1
} finally {
    $env:VITE_API_URL = $previousApi
    if ($transcribing) { Stop-Transcript | Out-Null }
    if ($lock) { $lock.Dispose() }
}
