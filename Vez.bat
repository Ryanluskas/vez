@echo off
setlocal
title Vez - motor
cd /d "%~dp0"

echo.
echo   vez
echo   ---
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js nao esta instalado.
  echo   Baixe em https://nodejs.org e rode este atalho de novo.
  echo.
  pause
  exit /b 1
)

REM ---- primeira vez: instala as dependencias ----
if not exist "painel\node_modules" (
  echo   Preparando o painel pela primeira vez. Isso demora um pouco...
  call npm install --prefix painel --silent
)
if not exist "motor\node_modules" (
  echo   Preparando o motor pela primeira vez...
  call npm install --prefix motor --silent
)

REM ---- limpa processos anteriores que possam ter ficado orfaos ----
taskkill /FI "WINDOWTITLE eq Vez - painel*" /T /F >nul 2>nul

REM ---- acorda a Evolution API no WSL Ubuntu (igual ao whatsapp-simulacoes-bot) ----
where wsl >nul 2>nul
if not errorlevel 1 (
  start /min "" wsl -d Ubuntu --exec true
)

REM ---- compila o painel se ainda nao tiver sido compilado ----
if not exist "painel\.next\BUILD_ID" (
  echo   Compilando o painel...
  call npm run build --prefix painel
  if errorlevel 1 (
    echo.
    echo   O painel nao compilou. Nada foi ligado.
    pause
    exit /b 1
  )
)

REM ---- painel numa janela minimizada ----
echo   Abrindo o painel...
start "Vez - painel" /min cmd /c "npm start --prefix painel"

REM ---- espera a porta 3000 responder (ate 60s) ----
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$fim=(Get-Date).AddSeconds(60); while((Get-Date) -lt $fim){ try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',3000); $c.Close(); exit 0 }catch{ Start-Sleep -Milliseconds 500 } }; exit 1"

if errorlevel 1 (
  echo   O painel demorou demais pra subir. Confira a janela "Vez - painel".
) else (
  start "" http://localhost:3000
  REM ---- abre o WhatsApp Web para acompanhar os atendimentos em tempo real ----
  start "" https://web.whatsapp.com
)

echo.
echo   Painel: http://localhost:3000
echo   Deixe esta janela aberta enquanto quiser ser atendido.
echo   Para parar tudo, feche esta janela.
echo.

REM ---- motor em primeiro plano: e aqui que aparece o QR e o log ----
call npm start --prefix motor

REM ---- fechou o motor: derruba o painel junto ----
echo.
echo   Motor encerrado. Fechando o painel...
taskkill /FI "WINDOWTITLE eq Vez - painel*" /T /F >nul 2>nul
echo.
pause
