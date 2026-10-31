$ErrorActionPreference = 'Stop'
$installRoot = $PSScriptRoot
$logs = Join-Path $installRoot '.cache\launcher'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$child = Start-Process -FilePath (Join-Path $installRoot 'runtime\node.exe') -ArgumentList ('"' + (Join-Path $installRoot 'scripts\thermal-agent\supervisor.js') + '"') -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'stdout.log') -RedirectStandardError (Join-Path $logs 'stderr.log')
$child.WaitForExit()
exit $child.ExitCode
