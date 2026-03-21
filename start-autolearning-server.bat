@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-autolearning-server.ps1"
if %errorlevel% neq 0 (
  echo [autolearning] Server failed to start. Error code: %errorlevel%
  pause
)
