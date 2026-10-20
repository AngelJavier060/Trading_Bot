# Registra las tareas programadas para que todo arranque solo al iniciar sesión.
# Ejecutar como ADMINISTRADOR desde la carpeta backend:
#   powershell -ExecutionPolicy Bypass -File deploy\register_tasks.ps1
#
# MT5 necesita una sesión de Windows abierta (no funciona como servicio).
# En un VPS configura el inicio de sesión automático (ver deploy\README_VPS.md)
# para que tras un reinicio se abra la sesión y se lancen estas tareas.

param(
    [string]$Terminal = "C:\Program Files\MetaTrader 5\terminal64.exe",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$User = "$env:USERDOMAIN\$env:USERNAME"
$Names = @("TradeBot-MT5", "TradeBot-Sistema", "TradeBot-Frontend", "TradeBot-Vigilante")
$Frontend = Join-Path (Split-Path -Parent $Root) "frontend"

foreach ($name in $Names) {
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $name -Confirm:$false
    }
}
if ($Remove) { Write-Host "Tareas eliminadas."; exit 0 }

if (-not (Test-Path $Terminal)) {
    Write-Host "No se encontró $Terminal. Usa -Terminal 'ruta\terminal64.exe'" -ForegroundColor Red
    exit 1
}

$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

# 1) Terminal MT5 al iniciar sesión
$mt5Action = New-ScheduledTaskAction -Execute $Terminal
$mt5Trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
Register-ScheduledTask -TaskName "TradeBot-MT5" -Action $mt5Action -Trigger $mt5Trigger `
    -Principal $principal -Settings $settings -Description "Abre MetaTrader 5 al iniciar sesión" | Out-Null

# 2) Sistema (run_forever relanza run.py si termina), 60 s después para dar tiempo a MT5
$sysAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Root\deploy\run_forever.ps1`"" `
    -WorkingDirectory $Root
$sysTrigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$sysTrigger.Delay = "PT60S"
Register-ScheduledTask -TaskName "TradeBot-Sistema" -Action $sysAction -Trigger $sysTrigger `
    -Principal $principal -Settings $settings -Description "TradeBot: API, supervisor y bot" | Out-Null

# 3) Frontend Next.js (panel web), 90 s después; se relanza si se cae
$feSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$feAction = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c npm run start -- -p 3000" -WorkingDirectory $Frontend
$feTrigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$feTrigger.Delay = "PT90S"
Register-ScheduledTask -TaskName "TradeBot-Frontend" -Action $feAction -Trigger $feTrigger `
    -Principal $principal -Settings $feSettings -Description "TradeBot: panel web (Next.js) en el puerto 3000" | Out-Null

# 4) Vigilante cada 5 minutos
$wdAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Root\deploy\watchdog.ps1`"" `
    -WorkingDirectory $Root
$wdTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(3) `
    -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "TradeBot-Vigilante" -Action $wdAction -Trigger $wdTrigger `
    -Principal $principal -Settings $settings -Description "Reinicia MT5/TradeBot si dejan de responder" | Out-Null

Write-Host "Tareas registradas para $User`:" -ForegroundColor Green
Get-ScheduledTask -TaskName "TradeBot-*" | Format-Table TaskName, State
Write-Host "Para iniciarlas ya sin cerrar sesión:  Start-ScheduledTask TradeBot-MT5; Start-ScheduledTask TradeBot-Sistema"
