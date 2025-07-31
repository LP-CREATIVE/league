@echo off
title League Apps Launcher

echo Starting League Apps...
echo.

echo [1/2] Starting Discord Bot...
cd /d "C:\Users\lucas\league\apps\discord-bot"
start /min cmd /c "npm run dev"

echo [2/2] Starting Harvester...
cd /d "C:\Users\lucas\league\apps\harvester"
start /min cmd /c "npm run dev"

echo.
echo All services started successfully!
echo.

echo Waiting for services to initialize...
timeout /t 3 /nobreak >nul

echo Opening League Coach Control Panel...
start http://localhost:4000

echo.
echo This window will close in 3 seconds...
timeout /t 3 /nobreak >nul