# FaultTrace local setup (Windows PowerShell)
# Usage:  .\scripts\setup-local.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "==> Backend venv + deps" -ForegroundColor Cyan
Push-Location (Join-Path $Root "backend")
if (-not (Test-Path ".venv")) {
  python -m venv .venv
}
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\pip.exe install -r requirements.txt
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created backend\.env from .env.example"
}
& .\.venv\Scripts\python.exe -m app.seed
Pop-Location

Write-Host "==> Frontend deps" -ForegroundColor Cyan
Push-Location (Join-Path $Root "frontend")
if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created frontend\.env from .env.example"
}
npm install
Pop-Location

Write-Host @"

Setup complete.

Terminal 1 — API:
  cd backend
  .\.venv\Scripts\activate
  uvicorn app.main:app --reload --port 8000

Terminal 2 — UI:
  cd frontend
  npm run dev

App:  http://127.0.0.1:5173
API:  http://127.0.0.1:8000/docs
Demo password: ADMIN
"@ -ForegroundColor Green
