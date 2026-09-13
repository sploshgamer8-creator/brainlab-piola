@echo off
echo ===================================================
echo     BrainLab Piola - Compilar y Desplegar a Railway
echo ===================================================
echo.

echo [1/3] Compilando frontend y servidor backend...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] La compilacion local fallo. Corrige los errores antes de desplegar.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Guardando cambios y sincronizando con GitHub...
git add -A
git commit -m "Deploy: updates and build"
git push origin main

echo.
echo [3/3] Desplegando a Railway...
call railway up -s brainlab
if %errorlevel% neq 0 (
    echo [ERROR] Fallo el despliegue en Railway.
    pause
    exit /b %errorlevel%
)

echo.
echo ===================================================
echo [EXITO] Despliegue completado con exito!
echo App disponible en: https://brainlab-production.up.railway.app
echo ===================================================
pause
