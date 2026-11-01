param(
    [switch]$Provision,
    [switch]$PrepareOnly,
    [switch]$NonInteractive,
    [string]$Organization = 'Farmacia Juncos - Preproduccion',
    [string]$Branch = 'Casa Central - Pruebas',
    [string]$Email
)

$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$productionScript = Join-Path $project 'scripts\publicar-produccion.ps1'
$defaultKey = Join-Path $env:USERPROFILE '.ssh\oracle-gestion.key'
$key = if ($env:GESTION_PREPROD_SSH_KEY) { [IO.Path]::GetFullPath($env:GESTION_PREPROD_SSH_KEY) } else { $defaultKey }
$remoteHost = if ($env:GESTION_PREPROD_HOST) { $env:GESTION_PREPROD_HOST } else { '163.176.241.51' }
$remoteUser = if ($env:GESTION_PREPROD_SSH_USER) { $env:GESTION_PREPROD_SSH_USER } else { 'ubuntu' }
$remote = $remoteUser + '@' + $remoteHost
$target = Join-Path $project 'SUBIR-A-NETLIFY-PREPROD'

function Run([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Fallo $Program (codigo $LASTEXITCODE)." }
}

function New-RemoteCommand([string]$Script) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Script))
    return "echo $encoded | base64 -d | bash"
}

if ($Provision -and $PrepareOnly) {
    throw 'Elegí Provision o PrepareOnly, no ambos.'
}
if (-not $Provision -and -not $PrepareOnly -and -not $NonInteractive) {
    Add-Type -AssemblyName System.Windows.Forms
    $answer = [Windows.Forms.MessageBox]::Show(
        'Se verificará y actualizará únicamente preproducción. Producción no se detiene ni se modifica. Al terminar se preparará SUBIR-A-NETLIFY-PREPROD. ¿Continuar?',
        'Publicar preproducción',
        'YesNo',
        'Question'
    )
    if ($answer -ne 'Yes') { exit 0 }
}
if (-not $PrepareOnly -and -not (Test-Path -LiteralPath $key -PathType Leaf)) {
    throw 'Falta una clave SSH de preproducción. Configurá GESTION_PREPROD_SSH_KEY o instalá la identidad autorizada en %USERPROFILE%\.ssh\oracle-gestion.key.'
}

$before = @(Get-ChildItem -LiteralPath (Join-Path $project '.cache\production') -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $productionScript -PrepareOnly
if ($LASTEXITCODE -ne 0) { throw 'La preparacion aislada fallo. No se contacto el VPS.' }

$stage = Get-ChildItem -LiteralPath (Join-Path $project '.cache\production') -Directory |
    Where-Object { $before -notcontains $_.FullName } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $stage) { throw 'No se encontro la preparacion nueva de preproduccion.' }
if ($stage.Name -notmatch '^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$') { throw 'Identificador de release inesperado.' }

$archive = Join-Path $stage.FullName 'backend.tar.gz'
$frontend = Join-Path $stage.FullName 'netlify-preprod-ready'
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw 'Falta el paquete de API preparado.' }
Copy-Item -LiteralPath (Join-Path $stage.FullName 'netlify-ready') -Destination $frontend -Recurse
$redirects = @"
/api/v1/* https://$remoteHost/preprod/api/v1/:splat 200!
/* /index.html 200
"@
[IO.File]::WriteAllText(
    (Join-Path $frontend '_redirects'),
    $redirects,
    [Text.UTF8Encoding]::new($false)
)

if ($PrepareOnly) {
    Write-Host "PREPARACION PREPRODUCCION OK: $frontend"
    Write-Host 'No se contactó el VPS ni se reemplazó SUBIR-A-NETLIFY-PREPROD.'
    exit 0
}

$sshArgs = @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-i',$key)
$release = "/home/ubuntu/gestion-preprod-releases/$($stage.Name)"
if (-not $Provision) {
    Run 'ssh.exe' ($sshArgs + @($remote, 'test -r /etc/gestion-preprod/environment; test -f /etc/systemd/system/gestion-preprod-api.service'))
}
Run 'ssh.exe' ($sshArgs + @($remote, (New-RemoteCommand "set -eu; mkdir -p '$release'")))
Run 'scp.exe' ($sshArgs + @($archive, ($remote + ':' + $release + '/backend.tar.gz')))
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$extract = @"
set -eu
cd '$release'
echo '$hash  backend.tar.gz' | sha256sum -c -
tar -xzf backend.tar.gz
sed -i 's/\r$//' deploy/oracle/provision-preproduction.sh deploy/oracle/update-preproduction-release.sh
"@
Run 'ssh.exe' ($sshArgs + @($remote, (New-RemoteCommand $extract)))

if ($Provision) {
    if (-not $Email) { $Email = Read-Host 'Correo del propietario de preproduccion' }
    $secure = Read-Host 'Clave nueva de preproduccion (minimo 16 caracteres)' -AsSecureString
    $password = [System.Net.NetworkCredential]::new('', $secure).Password
    try {
        if ($password.Length -lt 16) { throw 'La clave debe tener al menos 16 caracteres.' }
        $answers = "$Organization`n$Branch`n$Email`n$password`n"
        $answers | & ssh.exe @sshArgs $remote "sudo -n bash '$release/deploy/oracle/provision-preproduction.sh' '$release'"
        if ($LASTEXITCODE -ne 0) { throw 'El aprovisionamiento de preproduccion fallo.' }
    } finally {
        $password = $null
        $secure.Dispose()
    }
} else {
    $deploy = @"
set -eu
sudo -n systemd-run --unit=gestion-preprod-deploy-$($stage.Name) --wait --collect --property=Type=oneshot /bin/bash '$release/deploy/oracle/update-preproduction-release.sh' '$($stage.Name)'
sudo -n journalctl -u gestion-preprod-deploy-$($stage.Name) --no-pager -n 100
test -f '$release/DEPLOYED_OK'
"@
    Run 'ssh.exe' ($sshArgs + @($remote, (New-RemoteCommand $deploy)))
}

$health = Invoke-RestMethod -Uri ("https://$remoteHost/preprod/api/v1/health") -TimeoutSec 20
if ($health.status -ne 'ok' -or $health.database -ne 'ok') { throw 'La API de preproduccion no paso la comprobacion HTTPS.' }

if (Test-Path -LiteralPath $target) {
    Move-Item -LiteralPath $target -Destination (Join-Path $stage.FullName 'netlify-preprod-anterior')
}
Move-Item -LiteralPath $frontend -Destination $target
Write-Host "PREPRODUCCION LISTA. Subir a Netlify: $target"
