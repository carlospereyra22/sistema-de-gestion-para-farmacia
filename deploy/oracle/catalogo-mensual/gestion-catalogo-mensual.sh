#!/usr/bin/env bash
# Corre la actualizacion mensual del catalogo externo (SISTEMA-113).
# Los scripts son la copia instalada en /usr/local/lib/gestion-catalogo: se
# actualizan solo al reinstalar, nunca desde Git en la corrida.
set -euo pipefail
export PLAYWRIGHT_BROWSERS_PATH=/var/lib/gestion-catalogo/navegadores
export UV_CACHE_DIR=/var/lib/gestion-catalogo/uv-cache
export UV_PYTHON_INSTALL_DIR=/var/lib/gestion-catalogo/python
/usr/local/bin/uv run --python 3.12 \
  --with playwright --with httpx --with pillow --with openpyxl --with "psycopg[binary]" \
  python /usr/local/lib/gestion-catalogo/actualizar_mensual.py --datos /var/lib/gestion-catalogo/datos
# Respaldos previos a cada instalacion: quedan los de los ultimos tres meses.
find /var/backups/gestion-catalogo -maxdepth 1 -name 'catalogo-*.dump' -mtime +100 -delete
