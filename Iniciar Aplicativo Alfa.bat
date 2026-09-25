@echo off
setlocal

cd /d "%~dp0"
if errorlevel 1 (
  echo Nao foi possivel acessar a pasta do aplicativo.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\expo.cmd" (
  echo Instalando as dependencias do aplicativo...
  call npm.cmd install
  if errorlevel 1 (
    echo Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
)

call "node_modules\.bin\expo.cmd" start --tunnel
if errorlevel 1 pause

endlocal