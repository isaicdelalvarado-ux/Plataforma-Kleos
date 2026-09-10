@echo off
chcp 65001 >nul
title INICIAR AGENTE VIGILANTE KLEOS (WATCHDOG PERMANENTE)
echo ==============================================================================
echo 🛡️  PLATAFORMA KLEOS - INICIANDO AGENTE VIGILANTE PERMANENTE
echo ==============================================================================
echo.
echo Iniciando el Agente Vigilante en segundo plano (intervalo de revision: cada 3 min)...
echo Supervisa continuamente:
echo   1. Salud del Web Endpoint y Frontend (Clean Squat, Metcon sin bloqueos)
echo   2. Integridad de Google Sheets (Registro_Diario, Wellness, RM_Atletas)
echo   3. Auto-reparacion de formulas y aislamiento metabolico en tiempo real.
echo.

cd /d "%~dp0"
start "Vigilante Kleos Daemon" /MIN python vigilante_kleos.py --loop 180

echo [OK] Agente Vigilante ejecutandose activamente en segundo plano.
echo Para consultar el estado en cualquier momento, abra: ver_estado_vigilante.bat
echo O revise el archivo: estado_salud_kleos.json
echo.
timeout /t 5
