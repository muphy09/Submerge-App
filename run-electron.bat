@echo off
setlocal
REM Ensure Electron runs (not Node-as-Electron) and in dev mode
set ELECTRON_RUN_AS_NODE=
set NODE_ENV=development

REM Resolve paths
set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
set "APP_DIR=%~dp0."

REM Launch Electron pointing at the app root
"%ELECTRON_EXE%" "%APP_DIR%"
endlocal
