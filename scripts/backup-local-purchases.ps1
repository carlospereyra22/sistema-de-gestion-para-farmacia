$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '../apps/api/.env'
$entry = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$databaseUri = [Uri]($entry.Substring(13).Trim().Trim('"'))
if ($databaseUri.Host -notin @('localhost','127.0.0.1') -or $databaseUri.AbsolutePath -ne '/gestion_dev') { throw 'Sólo base local de pruebas.' }
$destination = Join-Path $env:LOCALAPPDATA 'FarmaciaJuncos\RespaldosLocales'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
if ((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Destino enlazado no permitido.' }
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
[IO.DirectoryInfo]::new($destination).SetAccessControl($acl)
$target = Join-Path $destination ('compras-v2-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
$credentials = $databaseUri.UserInfo.Split(':', 2)
$previousPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = [Uri]::UnescapeDataString($credentials[1])
  & 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' -h $databaseUri.Host -p $databaseUri.Port -U ([Uri]::UnescapeDataString($credentials[0])) -d gestion_dev -Fc -f $target
  if ($LASTEXITCODE -ne 0) { throw 'Falló el respaldo.' }
  & 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' --list $target | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer el respaldo.' }
  Get-Item -LiteralPath $target | Select-Object FullName,Length
} finally { $env:PGPASSWORD = $previousPassword }
