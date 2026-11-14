@echo off
title Sistema de Gestion - Docker
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\docker-local.ps1" detener
pause
