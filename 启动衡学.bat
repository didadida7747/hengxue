@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [HengXue] Node.js not found. Please install it from https://nodejs.org then try again.
  pause
  exit /b 1
)
title HengXue Study Balance
echo Starting HengXue Study Balance ...
node server.js
echo.
echo HengXue stopped.
pause
