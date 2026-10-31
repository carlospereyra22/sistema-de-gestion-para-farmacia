#!/usr/bin/env bash
# Run with bash; secrets are prompted, never passed as command-line arguments.
set +x
set -euo pipefail
if [ "$#" -ne 3 ]; then
  echo 'Uso: bash prisma/bootstrap-production.sh "Negocio" "Sucursal" "correo"'
  exit 1
fi
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export BOOTSTRAP_ORGANIZATION="$1" BOOTSTRAP_BRANCH="$2" BOOTSTRAP_EMAIL="$3"
trap 'unset clave_db confirmacion BOOTSTRAP_PASSWORD DATABASE_URL' EXIT
read -r -s -p 'Clave de PostgreSQL (gestion_app): ' clave_db </dev/tty
echo
read -r -s -p 'NUEVA clave del administrador (minimo 16 caracteres): ' BOOTSTRAP_PASSWORD </dev/tty
echo
read -r -s -p 'Repeti la clave del administrador: ' confirmacion </dev/tty
echo
if [ "$BOOTSTRAP_PASSWORD" != "$confirmacion" ]; then
  echo 'Las claves no coinciden. No se modifico nada.'
  exit 1
fi
DATABASE_URL=$(CLAVE_DB="$clave_db" node -e 'process.stdout.write("postgresql://gestion_app:"+encodeURIComponent(process.env.CLAVE_DB)+"@127.0.0.1:5432/gestion_prod?schema=public")')
unset clave_db confirmacion
export DATABASE_URL BOOTSTRAP_PASSWORD
pnpm exec ts-node prisma/bootstrap-production.ts
