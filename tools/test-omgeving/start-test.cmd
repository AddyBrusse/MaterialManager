@echo off
rem Start de test-app voor de managers (poort 3100). Zie LEESMIJ.md in deze map.
rem Dit venster open laten: sluiten = test-app uit.
cd /d "%~dp0\..\.."
title ShopCommand TEST - poort 3100
call npm run test-omgeving:start
pause
