$ErrorActionPreference = 'Stop'
$nombreTareaGestion = 'FarmaciaJuncos-RespaldoOracle'
$identidadTareaGestion = [System.Security.Principal.WindowsIdentity]::GetCurrent()
if ($identidadTareaGestion.Name -match 'codexsandbox') {
    throw 'Ejecutar en la cuenta real del usuario, no en la cuenta aislada de Codex.'
}
if (Get-ScheduledTask -TaskName $nombreTareaGestion -ErrorAction SilentlyContinue) {
    throw 'La tarea ya existe. No se sobrescribio.'
}
if (-not (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.ssh\oracle-gestion.key'))) {
    throw 'Falta la clave SSH existente del usuario.'
}
$directorioTareaGestion = Join-Path $env:LOCALAPPDATA 'FarmaciaJuncos\Automatizacion'
if (Test-Path -LiteralPath $directorioTareaGestion) {
    throw 'La carpeta de automatizacion ya existe; revisar antes de repetir.'
}
New-Item -ItemType Directory -Path $directorioTareaGestion | Out-Null
$aclTareaGestion = [System.Security.AccessControl.DirectorySecurity]::new()
$aclTareaGestion.SetOwner($identidadTareaGestion.User)
$aclTareaGestion.SetAccessRuleProtection($true, $false)
$aclTareaGestion.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
    $identidadTareaGestion.User, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
))
Set-Acl -LiteralPath $directorioTareaGestion -AclObject $aclTareaGestion
foreach ($nombreScriptGestion in @('download-backup.ps1', 'scheduled-download.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $nombreScriptGestion) -Destination $directorioTareaGestion
}
$ejecutableGestion = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$scriptTareaGestion = Join-Path $directorioTareaGestion 'scheduled-download.ps1'
$accionGestion = New-ScheduledTaskAction -Execute $ejecutableGestion -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $scriptTareaGestion + '"')
$disparadoresGestion = @(
    (New-ScheduledTaskTrigger -Daily -At '19:00'),
    (New-ScheduledTaskTrigger -AtLogOn -User $identidadTareaGestion.Name)
)
$principalGestion = New-ScheduledTaskPrincipal -UserId $identidadTareaGestion.Name -LogonType Interactive -RunLevel Limited
$ajustesGestion = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15) -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $nombreTareaGestion -Action $accionGestion -Trigger $disparadoresGestion -Principal $principalGestion -Settings $ajustesGestion -Description 'Descarga privada del ultimo respaldo probado de Oracle a las 19:00 locales y al iniciar sesion. Requiere PC conectado. No modifica la base.' | Out-Null
Start-ScheduledTask -TaskName $nombreTareaGestion
Write-Output ('Tarea registrada e iniciada: ' + $nombreTareaGestion)
Write-Output ('Registro: ' + (Join-Path $directorioTareaGestion 'ultimo-respaldo.log'))
