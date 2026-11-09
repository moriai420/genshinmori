# Crea l'installer Windows: python -> enka_to_notion.exe -> installer Tauri.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "1/3 Impacchetto lo script Python..."
python -m pip install --upgrade pip pyinstaller requests
python -m PyInstaller --onefile --name enka_to_notion `
  --distpath src-tauri\binaries --workpath build\pyi --specpath build `
  python\enka_to_notion.py
if (-not (Test-Path src-tauri\binaries\enka_to_notion.exe)) { throw "enka_to_notion.exe non creato" }

Write-Host "2/3 Installo le dipendenze dell'app..."
npm install

Write-Host "3/3 Creo l'installer (la prima volta richiede alcuni minuti)..."
npm run build

Write-Host ""
Write-Host "Fatto. L'installer e' in: src-tauri\target\release\bundle\nsis\"
