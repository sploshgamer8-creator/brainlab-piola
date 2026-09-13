@echo off
title ONEBRAIN CONTINUOUS FLYWHEEL (24/7 AUTO-GROWTH)
color 0A
cd /d "c:\Users\totol\Desktop\BrainLabPiola"

echo ======================================================================
echo   ONEBRAIN 24/7 AUTONOMOUS CONTINUOUS FLYWHEEL (V2 AUTO-GROWTH)
echo ======================================================================
echo   - Direct Harvester Siphon from Railway PostgreSQL
echo   - STM Fluff Sanitizer + SFT Masking + Anchor Replay
echo   - ZeroBlockInsert Auto-Growth from 4L to 8L
echo ======================================================================
echo.

cmd /c "npm run flywheel"

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [!] El proceso se detuvo con codigo %ERRORLEVEL%.
  echo Presiona cualquier tecla para reiniciar...
  pause
  goto :start
)
pause
