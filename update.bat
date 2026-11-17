@echo off
setlocal
cd /d %~dp0
title Shiguangji Daily Update
set AUTO=0
if /i "%~1"=="auto" set AUTO=1

set NODE=C:\Users\SROD\.workbuddy\binaries\node\versions\24.14.0\node.exe
if not exist "%NODE%" set NODE=node

echo ============================================
echo   Shiguangji Daily Update
echo ============================================
echo.

echo [1/3] Fetching today's NASA + Bing data...
"%NODE%" update.js
if errorlevel 1 goto :fail

echo.
echo [2/3] Committing changes...
git add -A
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "daily update %date%"
) else (
    echo     No changes since last update.
)

echo.
echo [3/3] Pushing to GitHub Pages...

if not exist token.txt goto :notoken
set /p GTOKEN=<token.txt
echo %GTOKEN%| findstr /b "ghp_ github_" >nul
if errorlevel 1 goto :notoken

git push https://%GTOKEN%@github.com/laly0726/shiguangji.git main
if errorlevel 1 goto :fail

echo.
echo ============================================
echo   Done! Live at:
echo   https://laly0726.github.io/shiguangji/
echo ============================================
echo.
if "%AUTO%"=="1" goto :end
choice /c YN /m "Open the site in browser now"
if errorlevel 2 goto :end
start https://laly0726.github.io/shiguangji/
goto :end

:notoken
echo.
echo   [!] token.txt not found or invalid.
echo   One-time setup:
echo     1. Open https://github.com/settings/tokens
echo     2. Generate new token (classic), check "repo"
echo     3. Copy the ghp_... string
echo     4. Save it as the first line of "token.txt"
echo        (in this folder), then run again.
goto :end

:fail
echo.
echo   [!] Update failed. Check the messages above.

:end
echo.
if "%AUTO%"=="1" exit /b 0
pause
