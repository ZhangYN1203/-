@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 商品装具调拨单打印工具 - 开发模式
call npm install
if %ERRORLEVEL% NEQ 0 (
  pause
  exit /b 1
)
call npm run electron:dev
pause
