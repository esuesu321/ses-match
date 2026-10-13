@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo SES MATCH - ChatGPT connection test
echo This uses your ChatGPT plan, not a separately billed API key.
echo No real job or personnel data is sent by this connection test.
where node >nul 2>nul
if errorlevel 1 goto node_required
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 goto node_required
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto failed
node scripts/chatgpt-connect.mjs setup
if errorlevel 1 goto failed
echo.
echo SUCCESS: ChatGPT plan connection was verified.
echo You can close this window. Do not share any credential files.
pause
exit /b 0
:node_required
echo.
echo Node.js 24 or later is required.
echo Install the LTS version from https://nodejs.org/en/download then run this file again.
pause
exit /b 1
:failed
echo.
echo The connection test did not finish successfully.
echo Tell ChatGPT whether installation, sign-in, or verification failed.
echo Do not send passwords, authorization URLs, or credential files.
pause
exit /b 1
