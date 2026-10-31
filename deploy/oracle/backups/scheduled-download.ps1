$ErrorActionPreference = 'Stop'
$registroCopiasGestion = Join-Path $PSScriptRoot 'ultimo-respaldo.log'
try {
    ('Inicio: ' + (Get-Date -Format o)) | Set-Content -LiteralPath $registroCopiasGestion -Encoding UTF8
    & (Join-Path $PSScriptRoot 'download-backup.ps1') *>&1 | Out-File -LiteralPath $registroCopiasGestion -Append -Encoding UTF8
    ('Exito: ' + (Get-Date -Format o)) | Add-Content -LiteralPath $registroCopiasGestion -Encoding UTF8
    exit 0
} catch {
    ('FALLO: ' + $_.Exception.Message) | Add-Content -LiteralPath $registroCopiasGestion -Encoding UTF8
    exit 1
}
