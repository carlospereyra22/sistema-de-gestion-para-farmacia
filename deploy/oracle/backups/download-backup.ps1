$ErrorActionPreference = 'Stop'
$carpetaCopiasGestion = Join-Path $env:LOCALAPPDATA 'FarmaciaJuncos\Backups'
$claveSshGestion = Join-Path $env:USERPROFILE '.ssh\oracle-gestion.key'
if (-not (Test-Path -LiteralPath $claveSshGestion -PathType Leaf)) {
    throw 'No se encontro la clave SSH de Oracle.'
}
$carpetaNuevaGestion = -not (Test-Path -LiteralPath $carpetaCopiasGestion)
New-Item -ItemType Directory -Path $carpetaCopiasGestion -Force | Out-Null
if ((Get-Item -LiteralPath $carpetaCopiasGestion).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'La carpeta de respaldos no puede ser un enlace.'
}
$identidadGestion = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$aclGestion = Get-Acl -LiteralPath $carpetaCopiasGestion
if ($carpetaNuevaGestion) {
    $aclGestion.SetAccessRuleProtection($true, $false)
    foreach ($reglaGestion in @($aclGestion.GetAccessRules($true, $false, [System.Security.Principal.SecurityIdentifier]))) {
        [void]$aclGestion.RemoveAccessRuleSpecific($reglaGestion)
    }
    $aclGestion.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
        $identidadGestion, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
    ))
    ([System.IO.DirectoryInfo]::new($carpetaCopiasGestion)).SetAccessControl($aclGestion)
}
$accesosAjenosGestion = @($aclGestion.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | Where-Object {
    $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -ne $identidadGestion.Value
})
if ($accesosAjenosGestion.Count -gt 0) { throw 'La carpeta de respaldos tiene permisos para otros usuarios. Revisar antes de descargar.' }
$nombreCopiaGestion = 'gestion-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.dump'
$destinoGestion = Join-Path $carpetaCopiasGestion $nombreCopiaGestion
$parcialGestion = $destinoGestion + '.partial'
& scp.exe -p -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -i $claveSshGestion 'ubuntu@163.176.241.51:/var/backups/gestion/latest.dump' $parcialGestion
if ($LASTEXITCODE -ne 0) { throw 'Fallo la descarga. Ninguna copia anterior se modifico.' }
$flujoGestion = [IO.File]::OpenRead($parcialGestion)
try {
    $cabeceraGestion = New-Object byte[] 5
    $leidosGestion = $flujoGestion.Read($cabeceraGestion, 0, 5)
    if ($leidosGestion -ne 5 -or [Text.Encoding]::ASCII.GetString($cabeceraGestion) -ne 'PGDMP') {
        throw 'El archivo no tiene cabecera de respaldo PostgreSQL custom.'
    }
} finally { $flujoGestion.Dispose() }
Move-Item -LiteralPath $parcialGestion -Destination $destinoGestion
Write-Output ('COPIA DESCARGADA: ' + $destinoGestion)
if ((Get-Item -LiteralPath $destinoGestion).LastWriteTimeUtc -lt [DateTime]::UtcNow.AddHours(-48)) {
    throw 'La copia descargada tiene mas de 48 horas. Revisar la tarea de respaldos en Oracle.'
}
Write-Output 'Archivo sensible: no compartir ni subir a Netlify. No se eliminan copias anteriores del PC.'
