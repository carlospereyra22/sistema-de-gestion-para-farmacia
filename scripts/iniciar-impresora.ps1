param()
$ErrorActionPreference = 'Stop'
$agentRoot = Join-Path $PSScriptRoot 'thermal-agent'
$agentUrl = 'http://127.0.0.1:17890/health'
try { $health = Invoke-RestMethod -Uri $agentUrl -TimeoutSec 2 } catch { $health = $null }
if ($health) {
    if ($health.protocol -ne 'gestion-v21-minor-v1') { throw 'Ya hay otro agente en el puerto 17890. Cerra el borrador de tickets y volve a iniciar Gestion.' }
    Write-Host 'Agente de tickets listo.'
    return
}
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$agentLogs = Join-Path (Split-Path $PSScriptRoot -Parent) '.cache\thermal-agent'
New-Item -ItemType Directory -Path $agentLogs -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$agentProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + (Join-Path $agentRoot 'supervisor.js') + '"') -WorkingDirectory $agentRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $agentLogs "$stamp.log") -RedirectStandardError (Join-Path $agentLogs "$stamp.err.log")
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    try { $health = Invoke-RestMethod -Uri $agentUrl -TimeoutSec 1 } catch { $health = $null }
    if ($health.protocol -eq 'gestion-v21-minor-v1') { Write-Host 'Agente de tickets listo.'; return }
    if ($agentProcess.HasExited) { throw "El agente no pudo iniciar. Revisa $agentLogs" }
    Start-Sleep -Milliseconds 300
}
throw "El agente no respondio. Revisa $agentLogs"
