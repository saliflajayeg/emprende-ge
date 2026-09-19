@echo off
title EmprendeGE
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install
)
echo.
echo  EmprendeGE se abrira en tu navegador: http://localhost:3050
echo  (Cierra esta ventana para detener la app)
echo.
start "" http://localhost:3050
call npm run dev -- --port 3050
