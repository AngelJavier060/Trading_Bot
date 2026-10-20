# Arranque con un clic: abre MT5 (si hace falta), inicia el backend y el frontend y abre el panel.
# Lo usa el acceso directo "TradeBot MT5" del escritorio (ver deploy\create_shortcut.ps1).

$ErrorActionPreference = "Continue"
Add-Type -AssemblyName System.Windows.Forms
$Backend = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path (Split-Path -Parent $Backend) "frontend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$ApiUrl = "http://127.0.0.1:5000"
$PanelUrl = "http://localhost:3000"
$Terminal = $env:MT5_TERMINAL
if (-not $Terminal) { $Terminal = "C:\Program Files\MetaTrader 5\terminal64.exe" }

function Test-Url([string]$Url) {
    try { return (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3).StatusCode -lt 500 }
    catch { return ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 503) }  # 503 = vivo con problemas
}

function Fail([string]$Message) {
    [System.Windows.Forms.MessageBox]::Show($Message, "TradeBot MT5") | Out-Null
    exit 1
}

# 1) MetaTrader 5
if (-not (Get-Process -Name "terminal64" -ErrorAction SilentlyContinue) -and (Test-Path $Terminal)) {
    Start-Process -FilePath $Terminal
    Start-Sleep -Seconds 8   # dar tiempo a que el terminal inicie sesión
}

# 2) Backend (Python + MT5 + PostgreSQL)
if (-not (Test-Url "$ApiUrl/api/health")) {
    if (-not (Test-Path $Python)) { Fail "No se encontró $Python. Ejecuta backend\deploy\install.ps1 primero." }
    Start-Process -FilePath $Python -ArgumentList "run.py" -WorkingDirectory $Backend -WindowStyle Minimized
}

# 3) Frontend (Next.js). Se compila la primera vez o si el código es más nuevo que la compilación.
if (-not (Test-Url "$PanelUrl/login")) {
    if (-not (Test-Path (Join-Path $Frontend "node_modules"))) { Fail "Falta instalar el frontend: en $Frontend ejecuta 'npm install'." }
    $buildId = Join-Path $Frontend ".next\BUILD_ID"
    $newest = Get-ChildItem (Join-Path $Frontend "src") -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not (Test-Path $buildId) -or $newest.LastWriteTime -gt (Get-Item $buildId).LastWriteTime) {
        $build = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run build" -WorkingDirectory $Frontend -WindowStyle Minimized -PassThru -Wait
        if ($build.ExitCode -ne 0) { Fail "Falló la compilación del frontend (npm run build)." }
    }
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run start -- -p 3000" -WorkingDirectory $Frontend -WindowStyle Minimized
}

# 4) Esperar a ambos y abrir el panel
for ($i = 0; $i -lt 90; $i++) {
    if ((Test-Url "$ApiUrl/api/health") -and (Test-Url "$PanelUrl/login")) { Start-Process $PanelUrl; exit 0 }
    Start-Sleep -Seconds 1
}
Fail "El sistema no respondió en 90 s. Revisa backend\data\logs\bot.log"
