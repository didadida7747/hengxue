@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [HengXue] Node.js not found.
  pause
  exit /b 1
)
echo Uploading to GitHub Pages (didadida7747/hengxue) ...
node .deploy-upload.js
echo.
echo Done. Wait 1-2 minutes then visit: https://didadida7747.github.io/hengxue/
pause
