@echo off
cd /d "%~dp0"
title CRM
set CRM_LAUNCHER=1
start "" http://localhost:3000
:loop
node --env-file-if-exists=.env server.js
echo.
echo O programa foi reiniciado ou fechou. Voltando em 2 segundos (feche esta janela para parar).
timeout /t 2 /nobreak >nul
goto loop
