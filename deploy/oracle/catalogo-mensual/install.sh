#!/usr/bin/env bash
# Instala la actualizacion mensual del catalogo externo en el servidor
# (SISTEMA-113). Se corre como root desde la carpeta de una version publicada:
#   sudo bash deploy/oracle/catalogo-mensual/install.sh
# Para actualizar los scripts despues, volver a correrlo con --actualizar.
# No arranca ninguna corrida: el temporizador corre el dia 1 de cada mes.
set -euo pipefail
test "$EUID" -eq 0
aqui="$(cd "$(dirname "$0")" && pwd)"
scripts="$aqui/../../../scripts/external-catalog"
test -f "$scripts/actualizar_mensual.py"
actualizar="${1:-}"

if [ "$actualizar" != "--actualizar" ]; then
  for destino in /usr/local/lib/gestion-catalogo /usr/local/sbin/gestion-catalogo-mensual \
    /etc/systemd/system/gestion-catalogo-mensual.service /etc/systemd/system/gestion-catalogo-mensual.timer; do
    if [ -e "$destino" ]; then
      echo "Ya existe $destino. Para actualizar los scripts: install.sh --actualizar"
      exit 1
    fi
  done
fi
test -x /usr/local/bin/uv || { echo "Falta uv en /usr/local/bin/uv (ver README.md)."; exit 1; }
test -f /etc/gestion-catalogo/environment || { echo "Falta /etc/gestion-catalogo/environment (ver README.md)."; exit 1; }
command -v pg_dump >/dev/null

id gestion-catalogo >/dev/null 2>&1 || useradd --system --home /var/lib/gestion-catalogo --shell /usr/sbin/nologin gestion-catalogo
install -d -o gestion-catalogo -g gestion-catalogo -m 750 /var/lib/gestion-catalogo /var/lib/gestion-catalogo/datos
install -d -o gestion-catalogo -g gestion-catalogo -m 700 /var/backups/gestion-catalogo
install -d -o root -g root -m 755 /usr/local/lib/gestion-catalogo
# Solo el codigo Python y los SQL; nunca datos ni credenciales.
find /usr/local/lib/gestion-catalogo -maxdepth 1 -type f -delete
install -m 644 "$scripts"/*.py "$scripts"/*.sql /usr/local/lib/gestion-catalogo/
rm -f /usr/local/lib/gestion-catalogo/test_*.py
install -m 755 "$aqui/gestion-catalogo-mensual.sh" /usr/local/sbin/gestion-catalogo-mensual
install -m 644 "$aqui/gestion-catalogo-mensual.service" "$aqui/gestion-catalogo-mensual.timer" /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/gestion-catalogo-mensual.service /etc/systemd/system/gestion-catalogo-mensual.timer

# Navegador para Farmar (Playwright): dependencias del sistema como root y el
# navegador en la carpeta del usuario del servicio.
export PLAYWRIGHT_BROWSERS_PATH=/var/lib/gestion-catalogo/navegadores
sudo -u gestion-catalogo env PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" \
  UV_CACHE_DIR=/var/lib/gestion-catalogo/uv-cache UV_PYTHON_INSTALL_DIR=/var/lib/gestion-catalogo/python \
  /usr/local/bin/uv run --python 3.12 --with playwright python -m playwright install chromium
UV_CACHE_DIR=/root/.cache/uv /usr/local/bin/uv run --python 3.12 --with playwright python -m playwright install-deps chromium

systemctl daemon-reload
systemctl enable --now gestion-catalogo-mensual.timer
systemctl list-timers gestion-catalogo-mensual.timer --no-pager
echo "Listo. Primera corrida a mano (recomendado, mirando): sudo systemctl start gestion-catalogo-mensual.service"
