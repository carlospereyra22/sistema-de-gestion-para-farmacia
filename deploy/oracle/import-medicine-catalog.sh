#!/usr/bin/env bash
# Carga la base de medicamentos (SISTEMA-26) en el release activo de un ambiente.
# Solo agrega lo que falta: repetirla no pisa precios ya actualizados.
# Uso en el VPS: sudo bash import-medicine-catalog.sh <preprod|prod> <archivo.jsonl>
set +x
set -euo pipefail
test "$EUID" -eq 0

case "${1:-}" in
  preprod) service=gestion-preprod-api; environment=/etc/gestion-preprod/environment ;;
  prod) service=gestion-api; environment=/etc/gestion-api/environment ;;
  *) echo 'Uso: import-medicine-catalog.sh <preprod|prod> <archivo.jsonl>'; exit 1 ;;
esac
file=$(readlink -f "${2:?Falta el archivo .jsonl}")
test -r "$file"
test -r "$environment"

api=$(systemctl show "$service" -p WorkingDirectory --value)
test -f "$api/package.json"
cli=$(find "$api/dist" -name medicine-catalog.cli.js -not -path '*/node_modules/*' | head -n 1)
test -n "$cli" || { echo 'El release activo no tiene el comando: publicá primero.'; exit 1; }

run() {
  systemd-run --quiet --wait --pipe --collect --uid=ubuntu \
    --property="WorkingDirectory=$api" \
    --property=EnvironmentFile="$environment" \
    --setenv=PRICE_REFRESH_SCHEDULER=off \
    --setenv=SUBSCRIPTION_SCHEDULER=off \
    /usr/local/bin/node "$cli" "$@"
}

echo "Antes en $1:"
run estado
run importar "$file"
echo "Después en $1:"
run estado
