@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo SES MATCH - Verify saved ChatGPT connection
echo No sign-in or real job/personnel data is required for this test.
if not exist package-lock.json goto extract_required
where node >nul 2>nul
if errorlevel 1 goto node_required
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto failed
node scripts/chatgpt-connect.mjs verify
if errorlevel 1 goto failed
echo SUCCESS: ChatGPT plan connection was verified.
pause
exit /b 0
:extract_required
echo Extract ALL files from the ZIP before running this file.
pause
exit /b 1
:node_required
echo Node.js 24 or later is required.
pause
exit /b 1
:failed
echo Share only the failure stage, HTTP status, and Error code shown above.
echo Do not share passwords, authorization URLs, or credential files.
pause
exit /b 1
