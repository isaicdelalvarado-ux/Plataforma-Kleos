@echo off
chcp 65001 >nul
title DETENER AGENTE VIGILANTE KLEOS
echo ==============================================================================
echo 🛑 DETENIENDO AGENTE VIGILANTE KLEOS
echo ==============================================================================
echo.
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*vigilante_kleos.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Detenido proceso Vigilante PID:' $_.ProcessId }"
echo.
echo [OK] Procesos del Vigilante detenidos.
timeout /t 3
