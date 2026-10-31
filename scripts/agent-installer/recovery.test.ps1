$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'recovery.ps1')
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
$directory = Join-Path ([IO.Path]::GetTempPath()) ('gestion-recovery-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory | Out-Null
$task = [pscustomobject]@{ Actions = @([pscustomobject]@{ Execute = "$env:SystemRoot\System32\wscript.exe"; Arguments = '"' + (Join-Path $directory 'run.vbs') + '"'; WorkingDirectory = $directory }) }
Assert (Test-AgentTask $task $directory) 'Owned task rejected'
$task.Actions[0].Arguments += ' other.vbs'
Assert (-not (Test-AgentTask $task $directory)) 'Foreign task accepted'
$process = [pscustomobject]@{ ExecutablePath = Join-Path $directory 'runtime\node.exe'; CommandLine = 'node "' + (Join-Path $directory 'scripts\thermal-agent\server.js') + '"' }
Assert (Test-AgentProcess $process $directory) 'Owned process rejected'
$process.CommandLine = 'node ' + (Join-Path $directory 'scripts\thermal-agent\server.js')
Assert (Test-AgentProcess $process $directory) 'Unquoted owned process rejected'
$process.ExecutablePath = 'C:\Other\node.exe'
Assert (-not (Test-AgentProcess $process $directory)) 'Foreign process accepted'
$configPath = Join-Path $directory 'config.json'
$config = Get-AgentConfiguration $configPath 'New printer'
Assert ($config.port -eq 17890) 'Wrong default port'
[IO.File]::WriteAllText($configPath, '{"port":17890,"printerName":"Old","allowedOrigins":["https://example.test"],"extra":"keep"}')
$config = Get-AgentConfiguration $configPath 'New printer'
Assert ($config.printerName -eq 'New printer' -and $config.extra -eq 'keep' -and $config.allowedOrigins[0] -eq 'https://example.test') 'Existing configuration lost'
Assert ((Get-Content -LiteralPath $configPath -Raw).Contains('Old')) 'Read helper changed the file'
[IO.File]::WriteAllText($configPath, '{invalid')
$rejected = $false
try { Get-AgentConfiguration $configPath 'New' | Out-Null } catch { $rejected = $true }
Assert $rejected 'Corrupt config accepted'
Assert-AgentDirectory $directory
# Delete only the explicit test file and empty unique directory; never recurse.
Remove-Item -LiteralPath $configPath
Remove-Item -LiteralPath $directory
Write-Output 'PASS: task/process ownership, configuration preservation, incomplete and corrupt configuration.'
