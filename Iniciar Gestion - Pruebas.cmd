@echo off
title Sistema de Gestion - Pruebas
powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\panel-pruebas.ps1"
if errorlevel 1 pause
