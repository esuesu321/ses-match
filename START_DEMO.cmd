@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo SES MATCH - fictional matching test
if not exist package-lock.json goto extract_required
where node >nul 2>nul
if errorlevel 1 goto failed
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto failed
node scripts/start-demo.mjs
if errorlevel 1 goto failed
exit /b 0
:extract_required
echo Extract ALL files from the ZIP before running this file.
pause
exit /b 1
:failed
echo The demo could not start. Share the error screen without credentials.
pause
exit /b 1
