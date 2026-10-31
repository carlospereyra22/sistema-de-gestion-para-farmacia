function Assert-AgentDirectory([string]$Directory) {
    if (-not (Test-Path -LiteralPath $Directory)) { return }
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { throw 'La ruta del agente no es una carpeta.' }
    if ((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'La carpeta del agente es un enlace. No se modifica.' }
    foreach ($item in Get-ChildItem -LiteralPath $Directory -Recurse -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Hay enlaces en la instalacion. No se modifica.' }
    }
}

function Test-AgentTask($Task, [string]$Directory) {
    if (-not $Task) { return $true }
    $actions = @($Task.Actions)
    return $actions.Count -eq 1 -and
        $actions[0].Execute -ieq "$env:SystemRoot\System32\wscript.exe" -and
        $actions[0].Arguments -ieq ('"' + (Join-Path $Directory 'run.vbs') + '"') -and
        $actions[0].WorkingDirectory -ieq $Directory
}

function Test-AgentProcess($Process, [string]$Directory) {
    if ($Process.ExecutablePath -ine (Join-Path $Directory 'runtime\node.exe')) { return $false }
    return $Process.CommandLine -match ('(?:^|\s)"?' + [regex]::Escape((Join-Path $Directory 'scripts\thermal-agent')) + '\\(supervisor|server)\.js"?(?:\s|$)')
}

function Get-AgentConfiguration([string]$Path, [string]$PrinterName) {
    if (Test-Path -LiteralPath $Path) {
        try { $config = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
        catch { throw 'La configuracion existente esta danada. Se conserva para revision; no se reemplaza por valores vacios.' }
        if ($config.port -ne 17890 -or -not $config.allowedOrigins -or -not ($config.printerName -is [string])) {
            throw 'La configuracion existente no es compatible. No se sobrescribe.'
        }
        $config.printerName = $PrinterName
        return $config
    }
    return @{ printerName = $PrinterName; port = 17890; allowedOrigins = @('http://localhost:5173', 'http://127.0.0.1:5173', 'https://sistema-de-gestion22.netlify.app') }
}
