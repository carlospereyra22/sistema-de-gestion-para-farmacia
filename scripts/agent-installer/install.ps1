param([string]$PrinterName, [switch]$ValidateOnly, [string]$LegacyJournalDirectory)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'recovery.ps1')
$installationLock = $null
try {
    if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw 'Esta prueba requiere Windows x64.' }
    $payload = Join-Path $PSScriptRoot 'payload'
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
    foreach ($entry in $manifest.files) {
        if ($entry.path -notmatch '^[a-zA-Z0-9_./-]+$' -or $entry.path.Contains('..') -or $entry.path.StartsWith('/')) { throw 'Ruta de paquete invalida.' }
        $file = Join-Path $payload $entry.path
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { throw ('Archivo incompleto o alterado: ' + $entry.path) }
    }
    $runtime = Join-Path $payload 'runtime\node.exe'
    if ((Get-AuthenticodeSignature -LiteralPath $runtime).Status -ne 'Valid') { throw 'No se pudo verificar la firma del runtime. No se instalara.' }
    $printers = @(Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name)
    if ($ValidateOnly) { Write-Output 'Paquete y runtime verificados. No se instalo ni se imprimio nada.'; return }
    Add-Type -AssemblyName System.Windows.Forms
    $destination = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'GestionPrintAgent'))
    Assert-AgentDirectory $destination
    $existing = Test-Path -LiteralPath $destination
    $installationLock = [IO.File]::Open((Join-Path $env:LOCALAPPDATA 'GestionPrintAgent-install.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    if ((Get-Service Spooler).Status -ne 'Running') { throw 'La cola de impresion de Windows esta detenida. Iniciala desde Servicios y volve a abrir el instalador. No se cambio nada.' }
    if (-not $printers.Count) { throw 'Windows no tiene impresoras instaladas. Instala el driver oficial de la termica, conectala y volve a abrir este instalador. Todavia no se instalo el agente.' }
    if (-not $PrinterName) {
        $form = New-Object Windows.Forms.Form
        $form.Text = 'Configurar o recuperar impresion de Gestion'
        $form.Size = New-Object Drawing.Size(550, 320)
        $form.StartPosition = 'CenterScreen'
        $form.FormBorderStyle = 'FixedDialog'
        $form.MaximizeBox = $false
        $label = New-Object Windows.Forms.Label
        $label.Text = "Agente local de Gestion - prueba para este usuario de Windows.`r`nSe iniciara al iniciar sesion, sin consola.`r`nFormato RAW de 80 mm, validado para Xprinter XP-80.`r`nOtros modelos requieren una prueba de compatibilidad.`r`nNo instala drivers ni imprime tickets durante la instalacion."
        $label.SetBounds(20, 15, 500, 105)
        $picker = New-Object Windows.Forms.ComboBox
        $picker.DropDownStyle = 'DropDownList'
        $picker.SetBounds(20, 130, 495, 30)
        foreach ($printer in $printers) { [void]$picker.Items.Add($printer) }
        if ($printers -contains 'Xprinter XP-80') { $picker.SelectedItem = 'Xprinter XP-80' }
        $install = New-Object Windows.Forms.Button
        $install.Text = 'Configurar'
        $install.SetBounds(285, 210, 110, 35)
        $install.DialogResult = 'OK'
        $install.Enabled = $picker.SelectedIndex -ge 0
        $picker.Add_SelectedIndexChanged({ $install.Enabled = $picker.SelectedIndex -ge 0 })
        $cancel = New-Object Windows.Forms.Button
        $cancel.Text = 'Cancelar'
        $cancel.SetBounds(405, 210, 110, 35)
        $cancel.DialogResult = 'Cancel'
        $form.Controls.AddRange(@($label, $picker, $install, $cancel))
        $form.AcceptButton = $install; $form.CancelButton = $cancel
        if ($form.ShowDialog() -ne 'OK') { return }
        $PrinterName = [string]$picker.SelectedItem
        $form.Dispose()
    }
    if ($printers -notcontains $PrinterName) { throw 'La impresora seleccionada no esta instalada en Windows.' }
    $printer = Get-CimInstance Win32_Printer | Where-Object Name -EQ $PrinterName
    if (-not $printer.DriverName -or $printer.WorkOffline -or $printer.PrinterStatus -eq 7) { throw 'La impresora seleccionada no esta disponible en Windows. Revisa el driver, cable y estado sin conexion. No se cambio la instalacion.' }
    if ($printer.PortName -match '^(FILE:|PORTPROMPT:)$' -or $printer.DriverName -match 'Microsoft (Print To PDF|XPS)') { throw 'Selecciona la impresora termica, no PDF, XPS ni imprimir a archivo.' }
    $taskName = 'Gestion-PrintAgent'
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not (Test-AgentTask $existingTask $destination)) { throw 'La tarea existente apunta a otra instalacion. No se modifica ni se inicia otro agente.' }
    $configPath = Join-Path $destination 'scripts\thermal-agent\config.json'
    $config = Get-AgentConfiguration $configPath $PrinterName
    if ($existing -or $existingTask) {
        $answer = [Windows.Forms.MessageBox]::Show('Se recuperara o actualizara el agente y se configurara la impresora seleccionada. Se guardara un respaldo y se conservara todo el historial. Cerra las ventanas de impresion y verifica que no se este imprimiendo. Continuar?', 'Recuperar impresion', 'YesNo', 'Warning')
        if ($answer -ne 'Yes') { return }
        $backup = Join-Path $env:LOCALAPPDATA ('GestionPrintAgent-backup-' + [guid]::NewGuid().ToString('N'))
        if ($existing) { Copy-Item -LiteralPath $destination -Destination $backup -Recurse }
        else { New-Item -ItemType Directory -Path $backup | Out-Null }
        if ($existingTask) {
            Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $backup 'scheduled-task.xml') -Encoding Unicode
        }
        $running = @(Get-CimInstance Win32_Process)
        if (@($running | Where-Object { $_.CommandLine -and $_.CommandLine.Contains((Join-Path $destination 'scripts\thermal-agent\raw-print.ps1')) }).Count) {
            throw 'Hay una impresion en curso. Espera a que termine y volve a configurar; no se interrumpio el envio.'
        }
        if ($existingTask) { Stop-ScheduledTask -TaskName $taskName }
        # Stop only this installed runtime, supervisors first; never all Node processes.
        foreach ($script in @('supervisor.js','server.js')) {
            Get-CimInstance Win32_Process | Where-Object { (Test-AgentProcess $_ $destination) -and $_.CommandLine.Contains($script) } | ForEach-Object {
                Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
            }
        }
        Start-Sleep -Milliseconds 600
    }
    $listener = New-Object Net.Sockets.TcpClient
    $occupied = $false
    try {
        $connect = $listener.ConnectAsync('127.0.0.1', 17890)
        $occupied = $connect.Wait(600) -and $listener.Connected
    } catch { } finally { $listener.Dispose() }
    if ($occupied) { throw 'Ya hay un componente usando el puerto de impresion. No se iniciara un segundo agente.' }
    # Older project installations have their own durable journal. Never silently
    # start with an empty history on a machine that already had that installation.
    $legacyTasks = @(Get-ScheduledTask | Where-Object TaskName -Like 'Gestion-Impresion-*')
    if ($legacyTasks.Count -and -not $LegacyJournalDirectory) {
        $candidates = @($legacyTasks | ForEach-Object {
            foreach ($action in $_.Actions) {
                if ($action.Arguments -match '-File "([^"]+supervisor-impresora\.ps1)"') {
                    $oldRoot = Split-Path (Split-Path $Matches[1] -Parent) -Parent
                    $candidate = Join-Path $oldRoot '.cache\thermal-print-jobs'
                    if (Test-Path -LiteralPath $candidate -PathType Container) { $candidate }
                }
            }
        } | Select-Object -Unique)
        if ($candidates.Count -eq 1) { $LegacyJournalDirectory = $candidates[0] }
        else { throw 'Se encontro una instalacion anterior. Hay que conservar su historial antes de instalar; no se borro nada.' }
        if (@($legacyTasks | Where-Object { $_.State -ne 'Disabled' }).Count) { throw 'Deshabilita el inicio automatico del agente anterior antes de continuar. No se modifico esa tarea.' }
    }
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @($identity.User, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    }
    Set-Acl -LiteralPath $destination -AclObject $acl
    foreach ($entry in $manifest.files) {
        $target = Join-Path $destination $entry.path
        New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $payload $entry.path) -Destination $target
    }
    [IO.File]::WriteAllText((Join-Path $destination 'scripts\thermal-agent\config.json'), ($config | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    if ($LegacyJournalDirectory) {
        $history = Join-Path $destination '.cache\thermal-print-jobs'
        New-Item -ItemType Directory -Path $history -Force | Out-Null
        Get-ChildItem -LiteralPath $LegacyJournalDirectory -File | Where-Object Name -Match '^[0-9a-f-]{36}\.json$' | ForEach-Object {
            $journalTarget = Join-Path $history $_.Name
            if (Test-Path -LiteralPath $journalTarget) {
                if ((Get-FileHash -LiteralPath $_.FullName).Hash -ne (Get-FileHash -LiteralPath $journalTarget).Hash) { throw 'Hay historiales de impresion en conflicto. Se conservaron ambos; no se inicio el agente.' }
            } else { Copy-Item -LiteralPath $_.FullName -Destination $journalTarget }
        }
    }
    $arguments = '"' + (Join-Path $destination 'run.vbs') + '"'
    $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" -Argument $arguments -WorkingDirectory $destination
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
    $principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force -Description 'Gestion: agente RAW por usuario, sin consola, con historial ant duplicados.' | Out-Null
    Start-ScheduledTask -TaskName $taskName
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try { $health = Invoke-RestMethod http://127.0.0.1:17890/status -TimeoutSec 3; if ($health.protocol -eq 'gestion-v21-minor-v1' -and $health.installed -eq $true -and $health.printer -eq $PrinterName) { $ready = $true; break } } catch { }
        Start-Sleep -Milliseconds 400
    }
    if (-not $ready) { throw ('No se pudo verificar agente e impresora. Podes volver a abrir este instalador para recuperar. Registros: ' + $destination + '\.cache\thermal-agent. No borres el historial.') }
    [void][Windows.Forms.MessageBox]::Show(('Agente conectado e impresora registrada en Windows: ' + $PrinterName + '. Volve a Gestion y pulsa Comprobar e imprimir (o Ya lo instale, reintentar en la web anterior). Si el navegador pide acceso a la red local, permitilo para el sitio de Gestion. No se imprimio nada; falta comprobar el papel.'), 'Configuracion verificada', 'OK', 'Information')
} catch {
    Write-Error $_ -ErrorAction Continue
    if (-not $ValidateOnly) {
        Add-Type -AssemblyName System.Windows.Forms
        $message = $_.Exception.Message
        if ($backup) { $message += "`r`nRespaldo conservado: $backup" }
        [void][Windows.Forms.MessageBox]::Show($message, 'No se completo la configuracion', 'OK', 'Error')
    }
    exit 1
} finally {
    if ($installationLock) { $installationLock.Dispose() }
}
