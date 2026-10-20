# Mantiene el sistema (run.py) siempre en marcha: si el proceso termina, lo vuelve a lanzar.
# Lo ejecuta la tarea programada "TradeBot-Sistema" al iniciar sesión.

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$LogDir = Join-Path $Root "data\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$RunnerLog = Join-Path $LogDir "runner.log"

function Write-RunnerLog([string]$Message) {
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $RunnerLog -Value $line -Encoding UTF8
}

Set-Location $Root
$restarts = 0
while ($true) {
    Write-RunnerLog "Iniciando run.py (reinicio n.$restarts)"
    $proc = Start-Process -FilePath $Python -ArgumentList "run.py" -WorkingDirectory $Root -NoNewWindow -PassThru `
        -RedirectStandardOutput (Join-Path $LogDir "stdout.log") -RedirectStandardError (Join-Path $LogDir "stderr.log")
    $proc.WaitForExit()
    Write-RunnerLog ("run.py terminó con código {0}" -f $proc.ExitCode)
    $restarts++
    # Espera creciente para no entrar en un bucle rápido si algo falla al arrancar
    $wait = [Math]::Min(10 * $restarts, 120)
    Start-Sleep -Seconds $wait
}
