@echo off
title League Coach Launcher

echo Starting League Coach Desktop App...
echo.

cd /d "C:\Users\lucas\league\apps\desktop-app"

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Launching League Coach...
start npm start

exit