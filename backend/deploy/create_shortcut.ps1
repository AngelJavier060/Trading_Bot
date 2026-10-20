# Crea el acceso directo "TradeBot MT5" en el escritorio (arranque con un clic).
#   powershell -ExecutionPolicy Bypass -File deploy\create_shortcut.ps1

$Root = Split-Path -Parent $PSScriptRoot
$Desktop = [Environment]::GetFolderPath("Desktop")
$Link = Join-Path $Desktop "TradeBot MT5.lnk"
$Icon = "C:\Program Files\MetaTrader 5\terminal64.exe"

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($Link)
$sc.TargetPath = "powershell.exe"
$sc.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Root\deploy\start_tradebot.ps1`""
$sc.WorkingDirectory = $Root
$sc.Description = "Abre MT5, inicia el TradeBot y abre el panel web"
if (Test-Path $Icon) { $sc.IconLocation = "$Icon,0" }
$sc.Save()
Write-Host "Acceso directo creado: $Link"
