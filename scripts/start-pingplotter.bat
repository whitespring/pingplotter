@echo off
:: PingPlotter Startup Script for Windows
:: This script starts the backend server and opens the frontend in the browser

title PingPlotter - Network Analyzer

echo ====================================================
echo         PingPlotter - Network Analyzer
echo              Starting up...
echo ====================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js found: %NODE_VERSION%

:: Check if npm packages are installed
if not exist "node_modules\" (
    echo.
    echo [INFO] Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

echo [OK] Dependencies installed
echo.

:: Kill any existing backend process
echo [INFO] Stopping any existing backend...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq monitor-backend*" >nul 2>nul

:: Wait a moment for the process to stop
timeout /t 2 /nobreak >nul

:: Start the backend server in a new window
echo [INFO] Starting backend server...
start "monitor-backend" /MIN node monitor-backend.js

:: Wait for backend to be ready (max 10 seconds)
echo [INFO] Waiting for backend to start...
set /a counter=0
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://localhost:3002/health >nul 2>nul
if %ERRORLEVEL% EQU 0 goto backend_ready
set /a counter+=1
if %counter% LSS 10 goto wait_loop

echo [ERROR] Backend failed to start within 10 seconds
taskkill /F /IM node.exe /FI "WINDOWTITLE eq monitor-backend*" >nul 2>nul
pause
exit /b 1

:backend_ready
echo [OK] Backend server is running
echo.

:: Open the HTML file in the default browser
echo [INFO] Opening PingPlotter in browser...
timeout /t 1 /nobreak >nul
start "" "%CD%\pingplotter.html"

echo.
echo ====================================================
echo           PingPlotter is now running!
echo.
echo   Backend:  http://localhost:3002
echo   Frontend: pingplotter.html (opened)
echo.
echo   The backend is running in a minimized window
echo   Close that window to stop the server
echo ====================================================
echo.
echo Press any key to exit this window...
pause >nul
