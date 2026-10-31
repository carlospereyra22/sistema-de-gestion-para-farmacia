param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName System.Net.Http
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$logDirectory = Join-Path $projectRoot '.cache\inicio-pruebas'
[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Sistema de Gestion - Pruebas" Width="570" Height="470" ResizeMode="CanMinimize"
        WindowStartupLocation="CenterScreen" Background="#F3F8FA" FontFamily="Segoe UI">
  <Window.Resources>
    <Style TargetType="Button">
      <Setter Property="Cursor" Value="Hand"/><Setter Property="FontSize" Value="14"/>
      <Setter Property="Padding" Value="18,12"/><Setter Property="Background" Value="White"/>
      <Setter Property="Foreground" Value="#087F72"/><Setter Property="BorderBrush" Value="#D3E4E8"/>
      <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="Button">
        <Border x:Name="surface" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="1" CornerRadius="10" Padding="{TemplateBinding Padding}">
          <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
        </Border>
        <ControlTemplate.Triggers>
          <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="surface" Property="Opacity" Value="0.8"/></Trigger>
          <Trigger Property="IsEnabled" Value="False"><Setter TargetName="surface" Property="Opacity" Value="0.4"/></Trigger>
        </ControlTemplate.Triggers>
      </ControlTemplate></Setter.Value></Setter>
    </Style>
  </Window.Resources>
  <Grid Margin="28">
    <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
    <StackPanel Margin="0,0,0,22">
      <TextBlock Text="SISTEMA DE GESTION" FontSize="12" FontWeight="SemiBold" Foreground="#087F72"/>
      <TextBlock Text="Tu espacio de pruebas" FontSize="26" FontWeight="SemiBold" Foreground="#172B46" Margin="0,5,0,4"/>
      <TextBlock Text="Controla la app local desde esta ventana." Foreground="#687D96" FontSize="13"/>
    </StackPanel>
    <Border Grid.Row="1" CornerRadius="16" Background="White" BorderBrush="#D3E4E8" BorderThickness="1" Padding="22">
      <StackPanel>
        <StackPanel Orientation="Horizontal">
          <Ellipse x:Name="Dot" Width="10" Height="10" Fill="#94A3B8" Margin="0,0,10,0"/>
          <TextBlock x:Name="Status" Text="Comprobando estado..." FontSize="18" FontWeight="SemiBold" Foreground="#172B46"/>
        </StackPanel>
        <TextBlock x:Name="Detail" Text="Conectando con los servicios locales." TextWrapping="Wrap" Foreground="#687D96" FontSize="13" Margin="0,10,0,18" MinHeight="38"/>
        <Grid><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition/></Grid.ColumnDefinitions>
          <Button x:Name="Start" Content="Iniciar gestion" Background="#087F72" Foreground="White" Margin="0,0,5,0"/>
          <Button x:Name="Stop" Content="Detener" Grid.Column="1" Foreground="#B94050" Margin="5,0,0,0"/>
        </Grid>
        <Button x:Name="Browser" Content="Abrir en el navegador" Margin="0,10,0,0"/>
      </StackPanel>
    </Border>
    <Grid Grid.Row="2" Margin="0,16,0,0"><Grid.ColumnDefinitions><ColumnDefinition/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
      <TextBlock Text="Solo pruebas locales. No modifica produccion." Foreground="#687D96" FontSize="11" VerticalAlignment="Center"/>
      <Button x:Name="Logs" Grid.Column="1" Content="Ver registros" Padding="10,6" FontSize="12"/>
    </Grid>
  </Grid>
</Window>
'@
$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)
if ($ValidateOnly) { Write-Output 'Panel WPF: XAML valido.'; exit 0 }
$controls = @{}
foreach ($name in @('Start','Stop','Browser','Logs','Status','Detail','Dot')) { $controls[$name] = $window.FindName($name) }
$script:worker = $null
$script:operation = ''
$script:lastError = ''
$script:probe = $null
$script:nextProbe = [DateTime]::MinValue
$handler = New-Object Net.Http.HttpClientHandler
$handler.UseProxy = $false
$client = New-Object Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(3)
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
function Start-Operation([string]$Mode) {
    if ($script:worker) { return }
    $script:operation = $Mode
    $script:lastError = ''
    $script:workerLog = Join-Path $logDirectory ('panel-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.log')
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'iniciar-pruebas.ps1') + '" -NoBrowser'
    if ($Mode -eq 'stop') { $arguments += ' -Stop' }
    $script:worker = Start-Process powershell.exe -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $script:workerLog -RedirectStandardError ($script:workerLog + '.err.log')
    $controls.Start.IsEnabled = $false
    $controls.Stop.IsEnabled = $false
    $controls.Browser.IsEnabled = $false
    $controls.Status.Text = $(if ($Mode -eq 'stop') { 'Deteniendo...' } else { 'Iniciando gestion...' })
    $controls.Detail.Text = 'Espera un momento. No cierres esta ventana durante la operacion.'
}
$controls.Start.Add_Click({ try { Start-Operation 'start' } catch { $script:lastError = $_.Exception.Message; $controls.Detail.Text = $script:lastError } })
$controls.Stop.Add_Click({
    $choice = [Windows.MessageBox]::Show($window, 'Termina o guarda tu trabajo antes de detener la app. PostgreSQL seguira encendido. Deseas continuar?', 'Detener pruebas', 'YesNo', 'Question')
    if ($choice -eq 'Yes') { try { Start-Operation 'stop' } catch { $script:lastError = $_.Exception.Message } }
})
$controls.Browser.Add_Click({ Start-Process 'http://localhost:5173' })
$controls.Logs.Add_Click({ Start-Process explorer.exe -ArgumentList ('"' + $logDirectory + '"') })
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(500)
$timer.Add_Tick({
    if ($script:worker) {
        if (-not $script:worker.HasExited) { return }
        if ($script:worker.ExitCode -ne 0) {
            $script:lastError = 'No se pudo completar la operacion. Abri Ver registros para ver el detalle.'
            $message = Get-Content -LiteralPath $script:workerLog -ErrorAction SilentlyContinue | Where-Object { $_ -like 'No se pudo iniciar:*' } | Select-Object -Last 1
            if ($message) { $script:lastError = $message }
        }
        $script:worker.Dispose()
        $script:worker = $null
        $script:nextProbe = [DateTime]::MinValue
    }
    if ($script:probe) {
        if (-not ($script:probe.api.IsCompleted -and $script:probe.web.IsCompleted)) { return }
        $apiOk = $false; $webOk = $false
        try { $health = $script:probe.api.Result | ConvertFrom-Json; $apiOk = $health.status -eq 'ok' -and $health.database -eq 'ok' } catch {}
        try { $webOk = $script:probe.web.Result -match '/src/main.tsx' } catch {}
        $script:probe = $null
        $controls.Start.IsEnabled = -not ($apiOk -and $webOk)
        $controls.Stop.IsEnabled = $apiOk -or $webOk -or (Test-Path (Join-Path $logDirectory '*-process.json'))
        $controls.Browser.IsEnabled = $apiOk -and $webOk
        if ($apiOk -and $webOk) {
            $controls.Status.Text = 'Gestion en funcionamiento'
            $controls.Dot.Fill = '#087F72'
            $controls.Detail.Text = 'La app y la base estan listas. Podes abrir el navegador.'
        } elseif ($apiOk -or $webOk) {
            $controls.Status.Text = 'Inicio incompleto'
            $controls.Dot.Fill = '#D69E2E'
            $controls.Detail.Text = 'Un servicio no responde. Usa Iniciar gestion para completar el arranque.'
        } else {
            $controls.Status.Text = 'Gestion detenida'
            $controls.Dot.Fill = '#94A3B8'
            $controls.Detail.Text = 'Presiona Iniciar gestion para comenzar a trabajar.'
        }
        if ($script:lastError) { $controls.Detail.Text = $script:lastError; $controls.Dot.Fill = '#B94050' }
        $script:nextProbe = [DateTime]::UtcNow.AddSeconds(3)
    }
    if (-not $script:probe -and [DateTime]::UtcNow -ge $script:nextProbe) {
        $script:probe = @{ api = $client.GetStringAsync('http://localhost:3000/api/v1/health'); web = $client.GetStringAsync('http://localhost:5173') }
    }
})
$window.Add_Closing({
    param($sender, $eventArgs)
    if ($script:worker -and -not $script:worker.HasExited) { $eventArgs.Cancel = $true; return }
    # Cerrar el panel no detiene los servidores: se usa el boton Detener.
    $timer.Stop()
    $client.Dispose()
})
$timer.Start()
$window.ShowDialog() | Out-Null
