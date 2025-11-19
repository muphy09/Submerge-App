@echo off
echo ========================================
echo   Pool Proposal Manager
echo ========================================
echo.
echo Starting Vite server...
start "Vite Dev Server" cmd /k "cd /d %~dp0 && npm run dev:react"

echo Waiting for Vite to initialize...
timeout /t 7 /nobreak > nul

echo.
echo Starting Electron application...
cd /d %~dp0
set NODE_ENV=development
node_modules\.bin\electron .
