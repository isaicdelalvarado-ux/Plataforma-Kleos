@echo off
chcp 65001 >nul
title CONSULTA DE SALUD - AGENTE VIGILANTE KLEOS
echo ==============================================================================
echo 🛡️  PLATAFORMA KLEOS - ESTADO DE SALUD DEL ECOSISTEMA
echo ==============================================================================
echo.
cd /d "%~dp0"
python vigilante_kleos.py --status
echo.
echo ==============================================================================
echo ULTIMAS LINEAS DE VIGILANTE.LOG:
echo ==============================================================================
powershell -Command "Get-Content -Path vigilante.log -Tail 15"
echo.
pause
