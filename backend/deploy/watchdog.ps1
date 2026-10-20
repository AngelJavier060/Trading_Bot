# Vigilante: lo ejecuta la tarea "TradeBot-Vigilante" cada 5 minutos.
# - Si el terminal MT5 no está abierto, lo abre.
# - Si /api/health no responde o devuelve 503 tres veces seguidas, mata run.py
#   (run_forever.ps1 lo vuelve a lanzar).

param(
    [string]$Url = "http://127.0.0.1:5000/api/health",
    [int]$MaxFailures = 3
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root "data\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir "watchdog.log"
$StateFile = Join-Path $LogDir "watchdog.state"

function Write-WatchLog([string]$Message) {
    Add-Content -Path $Log -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message) -Encoding UTF8
}

# 1) Terminal MT5
$terminalPath = $env:MT5_TERMINAL
if (-not $terminalPath) { $terminalPath = "C:\Program Files\MetaTrader 5\terminal64.exe" }
if (-not (Get-Process -Name "terminal64" -ErrorAction SilentlyContinue)) {
    if (Test-Path $terminalPath) {
        Write-WatchLog "MT5 no estaba abierto: iniciando $terminalPath"
        Start-Process -FilePath $terminalPath
    } else {
        Write-WatchLog "MT5 no está abierto y no se encontró $terminalPath (define MT5_TERMINAL)"
    }
}

# 2) Salud del sistema
$failures = 0
if (Test-Path $StateFile) { $failures = [int](Get-Content $StateFile -ErrorAction SilentlyContinue) }

$healthy = $false
try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
    $healthy = ($response.StatusCode -eq 200)
} catch {
    $healthy = $false
}

if ($healthy) {
    if ($failures -gt 0) { Write-WatchLog "Sistema sano de nuevo" }
    Set-Content -Path $StateFile -Value 0
    exit 0
}

$failures++
Set-Content -Path $StateFile -Value $failures
Write-WatchLog "Salud fallida ($failures/$MaxFailures)"
if ($failures -ge $MaxFailures) {
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
        Where-Object { ($_.CommandLine -like "*run.py*") -and (($_.CommandLine -like "*$Root*") -or ($_.ExecutablePath -like "$Root*")) }
    foreach ($p in $procs) {
        Write-WatchLog ("Reiniciando: se termina run.py (PID {0})" -f $p.ProcessId)
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Set-Content -Path $StateFile -Value 0
}
