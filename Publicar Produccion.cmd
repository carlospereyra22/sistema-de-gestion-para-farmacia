@echo off
title Gestion - Publicar produccion
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0scripts\publicar-produccion.ps1"
if errorlevel 1 pause
