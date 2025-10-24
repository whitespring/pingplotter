@echo off
:: PingPlotter Stop Script for Windows

echo Stopping PingPlotter Backend...

call npm run stop

echo Backend stopped
pause
