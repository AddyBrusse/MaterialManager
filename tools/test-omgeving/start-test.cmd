@echo off
rem Start de test-app voor de managers (poort 3100). Zie LEESMIJ.md in deze map.
rem
rem Wacht op Docker Desktop en de testdatabase, en start de test-app opnieuw als
rem hij stopt. Zo kan dit bestand bij het aanmelden starten, ook als Docker
rem dan nog aan het opstarten is. Dit venster open laten: sluiten = test-app uit.
cd /d "%~dp0\..\.."
title ShopCommand TEST - poort 3100

:opnieuw
call npm run test-omgeving:start
echo.
echo [%date% %time%] De test-app draait niet (meestal: Docker Desktop start nog op).
echo Over 30 seconden probeer ik het opnieuw. Stoppen: dit venster sluiten.
rem ping in plaats van timeout: werkt ook als het venster geen toetsenbord heeft.
ping -n 31 127.0.0.1 >nul
goto opnieuw
