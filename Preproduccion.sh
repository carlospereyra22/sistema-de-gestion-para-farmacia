#!/usr/bin/env bash
# Lanzador para Git Bash. La contraseña se solicita sólo una vez por PowerShell.
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "$0")" && pwd -W)
exec powershell.exe -NoProfile -ExecutionPolicy Bypass \
  -File "$project_dir\\scripts\\publicar-preproduccion.ps1" "$@"
