$ErrorActionPreference = 'Stop'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$supervisorPath = Join-Path $PSScriptRoot 'thermal-agent\supervisor.js'
$printingLogs = Join-Path (Split-Path $PSScriptRoot -Parent) '.cache\thermal-agent'
New-Item -ItemType Directory -Path $printingLogs -Force | Out-Null
# Native invocation (& node) can allocate a visible console with Windows Terminal.
# Keep the task alive for recovery, but start the native process explicitly hidden.
$supervisorProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + $supervisorPath + '"') -WorkingDirectory (Split-Path $supervisorPath -Parent) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $printingLogs 'supervisor-output.log') -RedirectStandardError (Join-Path $printingLogs 'supervisor-error.log')
$supervisorProcess.WaitForExit()
exit $supervisorProcess.ExitCode
