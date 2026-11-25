@echo off
setlocal
title Du Kich Studio
cd /d "%~dp0"

echo.
echo ============================================================
echo   Du Kich Studio - Local Launcher
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [!] Node.js was not found on this computer.
  echo.
  echo Please install Node.js LTS ^(v18 or newer^) once, then double-click
  echo Start-Windows.bat again:
  echo   https://nodejs.org/
  echo.
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

node -e "process.exit(parseInt(process.versions.node,10)>=18?0:1)" >nul 2>&1
if errorlevel 1 (
  echo [!] Your Node.js version is too old. Du Kich Studio requires Node.js 18+.
  echo Please update from https://nodejs.org/ and run this file again.
  echo.
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo [1/2] First-time setup: installing packages ^(usually 15-30 seconds^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] Package installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
  echo.
)

node -e "fetch('http://localhost:5288/').then(()=>process.exit(0)).catch(()=>process.exit(1))" >nul 2>&1
if not errorlevel 1 (
  echo Du Kich Studio is already running at http://localhost:5288/
  echo Opening it in your browser...
  start "" "http://localhost:5288/"
  timeout /t 2 /nobreak >nul
  exit /b 0
)

echo [2/2] Starting Du Kich Studio on http://localhost:5288/ ...
echo.
echo Keep this window open while presenting. Close it anytime to stop the app.
echo.
call npm run dev -- --open

if errorlevel 1 (
  echo.
  echo [ERROR] Du Kich Studio stopped unexpectedly.
  echo If port 5288 is used by another app, close that app and try again.
  pause
  exit /b 1
)
