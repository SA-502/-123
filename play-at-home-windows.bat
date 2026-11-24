@echo off
rem GRAVEWAVE home server: double-click this file on a Windows computer connected to your Wi-Fi.
rem Phones on the same Wi-Fi then open the address it prints (http://192.168.x.x:8080).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org , install it, then run this file again.
  pause
  exit /b 1
)
set GW_LAN=1
set PORT=8080
node server\server.js
pause
