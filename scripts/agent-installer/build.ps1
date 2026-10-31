$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$node = (Get-Command node.exe -ErrorAction Stop).Source
if ((Get-AuthenticodeSignature -LiteralPath $node).Status -ne 'Valid') { throw 'El runtime debe tener firma valida.' }
$license = Join-Path (Split-Path $node -Parent) 'LICENSE'
$stage = Join-Path $project ('.cache\agent-package-' + [guid]::NewGuid().ToString('N'))
$payload = Join-Path $stage 'payload'
$agent = Join-Path $payload 'scripts\thermal-agent'
New-Item -ItemType Directory -Path $agent -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $payload 'runtime') | Out-Null
Copy-Item -LiteralPath $node -Destination (Join-Path $payload 'runtime\node.exe')
if (Test-Path -LiteralPath $license) {
    Copy-Item -LiteralPath $license -Destination (Join-Path $payload 'runtime\LICENSE')
} else {
    $version = (& $node --version).Trim()
    if ($version -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+$') { throw 'Version de Node no reconocida.' }
    Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/nodejs/node/$version/LICENSE" -OutFile (Join-Path $payload 'runtime\LICENSE')
}
foreach ($file in @('server.js','supervisor.js','recovery.js','escpos-v2.js','validate-ticket.js','raw-print.ps1','logo-bitmap.json','store-name-bitmap.json')) {
    Copy-Item -LiteralPath (Join-Path $project ('scripts\thermal-agent\' + $file)) -Destination (Join-Path $agent $file)
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run.vbs') -Destination (Join-Path $payload 'run.vbs')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install.ps1') -Destination $stage
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'recovery.ps1') -Destination $stage
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Instalar.cmd') -Destination $stage
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Instalar.vbs') -Destination $stage
$files = @(Get-ChildItem -LiteralPath $payload -Recurse -File | ForEach-Object {
    @{ path = $_.FullName.Substring($payload.Length + 1).Replace('\','/'); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
})
$manifest = @{ version = '1.0.5-pilot'; files = $files }
[IO.File]::WriteAllText((Join-Path $stage 'manifest.json'), ($manifest | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
$downloads = Join-Path $project 'apps\web\public\downloads'
New-Item -ItemType Directory -Path $downloads -Force | Out-Null
$artifact = Join-Path $downloads 'gestion-impresion-windows.zip'
# Preserve a previous package before replacing the generated download.
if (Test-Path -LiteralPath $artifact) { Copy-Item -LiteralPath $artifact -Destination (Join-Path $stage 'previous-package.zip') }
Compress-Archive -Path (Join-Path $stage 'Instalar.cmd'),(Join-Path $stage 'Instalar.vbs'),(Join-Path $stage 'install.ps1'),(Join-Path $stage 'recovery.ps1'),(Join-Path $stage 'manifest.json'),$payload -DestinationPath (Join-Path $stage 'package.zip')
Copy-Item -LiteralPath (Join-Path $stage 'package.zip') -Destination $artifact -Force
Write-Output ('STAGE: ' + $stage)
Write-Output ('DOWNLOAD: ' + $artifact)
Get-FileHash -LiteralPath $artifact -Algorithm SHA256
