param([string]$VerifyFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$backupDirectory = Join-Path $env:LOCALAPPDATA 'FarmaciaJuncos\RespaldosCifrados'
if (-not (Test-Path -LiteralPath $backupDirectory)) {
    New-Item -ItemType Directory -Path $backupDirectory | Out-Null
    $backupIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $backupAcl = [System.Security.AccessControl.DirectorySecurity]::new()
    $backupAcl.SetOwner($backupIdentity)
    $backupAcl.SetAccessRuleProtection($true, $false)
    $backupAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($backupIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    Set-Acl -LiteralPath $backupDirectory -AclObject $backupAcl
}
if ((Get-Item -LiteralPath $backupDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Destino enlazado no permitido.' }
$backupUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if (@((Get-Acl -LiteralPath $backupDirectory).Access | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $backupUser }).Count) { throw 'Revisar permisos privados del destino.' }
$dialog = New-Object System.Windows.Forms.Form
$dialog.Text = 'Respaldo cifrado de Farmacia Juncos'
$dialog.Size = New-Object System.Drawing.Size(570,310)
$dialog.StartPosition = 'CenterScreen'
$dialog.TopMost = $true
$label = New-Object System.Windows.Forms.Label
$label.Text = 'Elegi una frase de al menos 16 caracteres y guardala en un lugar seguro. Sin ella no podremos recuperar esta copia. NO es tu clave fiscal. No la envies por chat.'
$label.SetBounds(20,15,515,65)
$dialog.Controls.Add($label)
$first = New-Object System.Windows.Forms.TextBox
$first.UseSystemPasswordChar = $true
$first.SetBounds(20,85,510,28)
$dialog.Controls.Add($first)
$secondLabel = New-Object System.Windows.Forms.Label
$secondLabel.Text = 'Repeti la misma frase:'
$secondLabel.SetBounds(20,125,500,20)
$dialog.Controls.Add($secondLabel)
$second = New-Object System.Windows.Forms.TextBox
$second.UseSystemPasswordChar = $true
$second.SetBounds(20,150,510,28)
$dialog.Controls.Add($second)
$button = New-Object System.Windows.Forms.Button
$button.Text = 'Crear y comprobar respaldo'
if ($VerifyFile) { $button.Text = 'Comprobar copia existente' }
$button.SetBounds(260,205,270,35)
$button.Add_Click({
    if ($first.Text.Length -lt 16 -or $first.Text.Length -gt 1024 -or $first.Text -cne $second.Text) {
        [void][System.Windows.Forms.MessageBox]::Show('Las frases deben coincidir y tener entre 16 y 1024 caracteres.'); return
    }
    $dialog.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $dialog.Close()
})
$dialog.Controls.Add($button)
$dialog.AcceptButton = $button
if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { $dialog.Dispose(); throw 'Respaldo cancelado. No se habilito facturacion.' }
$backupStart = New-Object System.Diagnostics.ProcessStartInfo
$backupStart.FileName = (Get-Command node.exe).Source
$backupStart.Arguments = '"' + (Join-Path $PSScriptRoot 'portable-fiscal-backup.cjs') + '"'
$backupStart.UseShellExecute = $false
$backupStart.CreateNoWindow = $true
$backupStart.RedirectStandardInput = $true
$backupStart.RedirectStandardOutput = $true
$backupStart.RedirectStandardError = $true
$backupProcess = [System.Diagnostics.Process]::Start($backupStart)
$backupProcess.StandardInput.Write((@{ password = $first.Text; verifyFile = $VerifyFile } | ConvertTo-Json -Compress))
$backupProcess.StandardInput.Close()
$first.Clear(); $second.Clear(); $dialog.Dispose()
$backupOutput = $backupProcess.StandardOutput.ReadToEnd()
$backupError = $backupProcess.StandardError.ReadToEnd()
$backupProcess.WaitForExit()
if ($backupProcess.ExitCode -ne 0) { throw $backupError }
Write-Output $backupOutput
