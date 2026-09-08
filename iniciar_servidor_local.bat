@echo off
setlocal enabledelayedexpansion
title Plataforma Kleos - Servidor Local Seguro
color 0B

echo ===================================================
echo     PLATAFORMA KLEOS - SERVIDOR LOCAL SEGURO
echo ===================================================
echo.

:: ----------------------------------------------------
:: PASO 1: LIBERACIÓN RÁPIDA DE PUERTOS (5500 Y 5501)
:: ----------------------------------------------------
echo [1/2] Verificando y liberando puertos previos...

:: Matar procesos en puerto 5500 sin bloquear la consola
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5500" ^| findstr /I "LISTENING ESCUCHANDO"') do (
    if not "%%P"=="0" (
        echo   [!] Finalizando proceso colgado en puerto 5500 (PID: %%P)...
        taskkill /F /PID %%P >nul 2>&1
    )
)

:: Matar procesos en puerto 5501
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5501" ^| findstr /I "LISTENING ESCUCHANDO"') do (
    if not "%%P"=="0" (
        echo   [!] Finalizando proceso colgado en puerto 5501 (PID: %%P)...
        taskkill /F /PID %%P >nul 2>&1
    )
)

:: ----------------------------------------------------
:: PASO 2: INICIAR SERVIDOR
:: ----------------------------------------------------
:: Intento 1: Python con servidor_kleos.py inteligente
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [2/2] Python detectado. Iniciando servidor inteligente...
    python servidor_kleos.py
    goto end
)

:: Intento 2: Node.js (npx serve)
npx --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [2/2] Node.js detectado. Iniciando con npx en puerto 5500...
    start http://127.0.0.1:5500/index.html
    npx --yes serve -p 5500 .
    goto end
)

:: Intento 3: Servidor nativo de Windows (PowerShell)
echo [2/2] Levantando servidor web nativo de Windows...
start http://127.0.0.1:5500/index.html
powershell -ExecutionPolicy Bypass -Command "$listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://127.0.0.1:5500/'); $listener.Start(); Write-Host 'Servidor nativo activo en http://127.0.0.1:5500 (Ctrl+C para salir)'; while ($listener.IsListening) { $ctx = $listener.GetContext(); $reqPath = $ctx.Request.Url.LocalPath.TrimStart('/'); if ([string]::IsNullOrEmpty($reqPath)) { $reqPath = 'index.html' }; $filePath = Join-Path (Get-Location) $reqPath; if (Test-Path $filePath -PathType Leaf) { $bytes = [System.IO.File]::ReadAllBytes($filePath); $ctx.Response.ContentLength64 = $bytes.Length; $ext = [System.IO.Path]::GetExtension($filePath).ToLower(); switch ($ext) { '.html' { $ctx.Response.ContentType = 'text/html; charset=utf-8' } '.js' { $ctx.Response.ContentType = 'application/javascript; charset=utf-8' } '.css' { $ctx.Response.ContentType = 'text/css; charset=utf-8' } default { $ctx.Response.ContentType = 'application/octet-stream' } }; $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length); } else { $ctx.Response.StatusCode = 404 }; $ctx.Response.OutputStream.Close() }"

:end
echo.
echo Servidor finalizado.
pause
