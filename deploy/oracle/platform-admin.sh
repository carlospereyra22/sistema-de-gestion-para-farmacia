#!/usr/bin/env bash
# Cuentas de plataforma en el release activo de un ambiente. La clave se pide sin
# mostrarla y entra por stdin: nunca como argumento ni variable de entorno.
# Uso en el VPS: sudo bash platform-admin.sh <preprod|prod> <crear|revocar|resetear-codigo> <correo>
#                sudo bash platform-admin.sh <preprod|prod> listar
set +x
set -euo pipefail
test "$EUID" -eq 0

case "${1:-}" in
  preprod) service=gestion-preprod-api; environment=/etc/gestion-preprod/environment ;;
  prod) service=gestion-api; environment=/etc/gestion-api/environment ;;
  *) echo 'Uso: platform-admin.sh <preprod|prod> <comando> [correo]'; exit 1 ;;
esac
shift
test -r "$environment"

api=$(systemctl show "$service" -p WorkingDirectory --value)
test -f "$api/package.json"
cli=$(find "$api/dist" -name platform-admin.cli.js -not -path '*/node_modules/*' | head -n 1)
test -n "$cli" || { echo 'El release activo no tiene el comando: publicá primero.'; exit 1; }

run() {
  systemd-run --quiet --wait --pipe --collect --uid=ubuntu \
    --property="WorkingDirectory=$api" \
    --property=EnvironmentFile="$environment" \
    /usr/local/bin/node "$cli" "$@"
}

if [ "${1:-}" = crear ]; then
  trap 'unset clave confirmacion' EXIT
  read -r -s -p 'Clave de la cuenta (minimo 16 caracteres): ' clave </dev/tty
  echo
  read -r -s -p 'Repeti la clave: ' confirmacion </dev/tty
  echo
  if [ "$clave" != "$confirmacion" ]; then
    echo 'Las claves no coinciden. No se modifico nada.'
    exit 1
  fi
  printf '%s' "$clave" | run "$@"
else
  run "$@" </dev/null
fi
