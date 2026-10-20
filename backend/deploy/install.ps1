# Instalación del sistema en un PC o VPS Windows.
# Ejecutar desde la carpeta backend:   powershell -ExecutionPolicy Bypass -File deploy\install.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "== TradeBot MT5: instalación en $Root ==" -ForegroundColor Cyan

# 1) Python
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
    Write-Host "No se encontró Python. Instala Python 3.12+ desde https://www.python.org (marca 'Add to PATH')." -ForegroundColor Red
    exit 1
}
& python --version

# 2) Entorno virtual y dependencias
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Creando entorno virtual .venv"
    & python -m venv .venv
}
& .venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& .venv\Scripts\python.exe -m pip install -r requirements.txt --quiet
if ($LASTEXITCODE -ne 0) { Write-Host "Falló la instalación de dependencias" -ForegroundColor Red; exit 1 }

# 3) Configuración
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Creado .env a partir de .env.example: revísalo (Telegram, API_TOKEN...)." -ForegroundColor Yellow
}
New-Item -ItemType Directory -Force -Path "data\logs" | Out-Null

# 4) Tests (sin terminal MT5)
Write-Host "Ejecutando tests..."
& .venv\Scripts\python.exe -m pytest -q
if ($LASTEXITCODE -ne 0) { Write-Host "Hay tests fallando: revisa antes de continuar" -ForegroundColor Red; exit 1 }

# 5) MT5: diagnóstico e instalación de los programas MQL5 (requiere el terminal abierto y con sesión)
if (Get-Process -Name "terminal64" -ErrorAction SilentlyContinue) {
    & .venv\Scripts\python.exe scripts\check_mt5.py
    & .venv\Scripts\python.exe scripts\mt5_tester.py install
} else {
    Write-Host "Abre MetaTrader 5, inicia sesión en tu cuenta y ejecuta:" -ForegroundColor Yellow
    Write-Host "   .venv\Scripts\python scripts\check_mt5.py"
    Write-Host "   .venv\Scripts\python scripts\mt5_tester.py install"
}

Write-Host ""
# 6) Frontend Next.js
$Frontend = Join-Path (Split-Path -Parent $Root) "frontend"
if (Test-Path $Frontend) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Host "Falta Node.js (https://nodejs.org, versión LTS) para el panel web." -ForegroundColor Red
    } else {
        Push-Location $Frontend
        if (-not (Test-Path ".env.local")) { Set-Content ".env.local" "NEXT_PUBLIC_API_URL=http://127.0.0.1:5000" -Encoding UTF8 }
        & npm install --no-audit --no-fund
        & npm run build
        Pop-Location
    }
}

Write-Host ""
Write-Host "Revisa en .env: DATABASE_URL (PostgreSQL) y FRONTEND_ORIGINS." -ForegroundColor Yellow
Write-Host "Siguiente paso: deploy\register_tasks.ps1 (como administrador) para el arranque automático." -ForegroundColor Cyan
