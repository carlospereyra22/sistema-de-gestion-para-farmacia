param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$printingRoot = Split-Path $PSScriptRoot -Parent
$hash = [Security.Cryptography.SHA256]::Create()
try { $suffix = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($printingRoot.ToLowerInvariant())))).Replace('-', '').Substring(0, 12) } finally { $hash.Dispose() }
$taskName = "Gestion-Impresion-$suffix"
$scriptPath = Join-Path $PSScriptRoot 'supervisor-impresora.ps1'
$arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $scriptPath + '"'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and ($existing.Actions.Arguments -notcontains $arguments)) { throw 'Existe una tarea distinta con ese nombre; no se modifica.' }
if ($Remove) {
    if ($existing) { Stop-ScheduledTask -TaskName $taskName; Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
    Write-Host 'Inicio automatico quitado. No se borraron tickets ni registros.'
    return
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $printingRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Impresion de Gestion: inicio automatico y recuperacion sin reenvio de tickets.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Impresion automatica configurada: $taskName"
