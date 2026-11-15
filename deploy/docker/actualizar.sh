#!/usr/bin/env bash
# Publica una versión de la API en contenedores (SISTEMA-106).
#
#   sudo bash deploy/docker/actualizar.sh <produccion|preprod> <id de versión>
#
# Equivale a deploy/oracle/update-release.sh (que se conserva para el modo
# systemd): construye la imagen desde la carpeta de la versión ya subida,
# comprueba las migraciones aplicadas, respalda, migra si hace falta y
# reinicia. Si no hay migraciones pendientes reinicia de a una copia, sin
# corte. Si las hay, detiene todo, migra y arranca, como hasta ahora.
# No hace seed ni reset. Requiere autorización del responsable (AGENTS.md).
set +x
set -euo pipefail
umask 027
test "$EUID" -eq 0

ambiente=${1:?ambiente requerido: produccion o preprod}
release_id=${2:?id de version requerido}
[[ "$release_id" =~ ^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$ ]]

case "$ambiente" in
  produccion)
    releases=/home/ubuntu/gestion-releases
    config=/etc/gestion-api
    verificador=deploy/oracle/check-migrations.cjs
    servicio_systemd=gestion-api
    ;;
  preprod)
    releases=/home/ubuntu/gestion-preprod-releases
    config=/etc/gestion-preprod
    verificador=deploy/oracle/check-preprod-migrations.cjs
    servicio_systemd=gestion-preprod-api
    ;;
  *) echo 'Ambiente desconocido: usar produccion o preprod.'; exit 1 ;;
esac

release="$releases/$release_id"
test "$(readlink -f "$release")" = "$release"
test -f "$release/apps/api/Dockerfile"
test -r "$config/environment"
test -r "$config/docker.env"
command -v docker >/dev/null

exec 9>"/run/lock/gestion-docker-$ambiente.lock"
flock -n 9 || { echo 'Ya hay otro despliegue en curso.'; exit 1; }

# El modo systemd y los contenedores usan los mismos puertos: no pueden convivir.
if systemctl is-active --quiet "$servicio_systemd"; then
  echo "El servicio $servicio_systemd sigue activo. Seguir el pase de docs/DOCKER.md antes de usar este script."
  exit 1
fi

fase=preparacion
trap 'echo "ERROR en fase: $fase, linea: $LINENO. No se revierte la base automaticamente; revisar el respaldo y docs/DOCKER.md (vuelta atras)."' ERR

imagen="gestion-api:$release_id"
archivos=(-f "$release/deploy/docker/compose.prod.yaml")
if [ "$ambiente" = produccion ]; then
  # Clave maestra de las credenciales fiscales, igual que update-release.sh:
  # se prepara (sin reemplazar una existente) y se monta siempre.
  bash "$release/deploy/oracle/prepare-fiscal-vault.sh"
  test -r /etc/gestion-fiscal/vault.key
  archivos+=(-f "$release/deploy/docker/compose.custodio-fiscal.yaml")
  if [ -f "$config/usar-fiscal-produccion" ]; then
    archivos+=(-f "$release/deploy/docker/compose.fiscal-produccion.yaml")
  fi
fi
compose() { docker compose --env-file "$config/docker.env" "${archivos[@]}" "$@"; }

echo 'Construyendo la imagen...'
docker build -f "$release/apps/api/Dockerfile" -t "$imagen" "$release"

# Imagen anterior, para la vuelta atrás.
anterior=$(sed -n 's/^GESTION_IMAGEN=//p' "$config/docker.env")
printf '%s\n' "$anterior" > "$release/imagen-anterior.txt"
sed -i "s|^GESTION_IMAGEN=.*|GESTION_IMAGEN=$imagen|" "$config/docker.env"
grep -q "^GESTION_IMAGEN=$imagen$" "$config/docker.env"

echo 'Comprobando que las migraciones aplicadas no cambiaron...'
compose run --rm --no-deps -w /app consola node "$verificador"

fase=respaldo
inicio=$(date +%s)
if [ "$ambiente" = produccion ]; then
  echo 'Respaldando produccion y verificando restauracion aislada...'
  systemctl start gestion-backup.service
  test "$(systemctl show gestion-backup.service -p Result --value)" = success
  test -s /var/backups/gestion/latest.dump
  test "$(stat -Lc %Y /var/backups/gestion/latest.dump)" -ge "$inicio"
  install -d -m 700 /var/backups/gestion/releases
  test ! -e "/var/backups/gestion/releases/$release_id.dump"
  cp --reflink=auto /var/backups/gestion/latest.dump "/var/backups/gestion/releases/$release_id.dump"
  chmod 600 "/var/backups/gestion/releases/$release_id.dump"
else
  install -d -m 700 /var/backups/gestion-preprod/releases
  respaldo="/var/backups/gestion-preprod/releases/$release_id.dump"
  test ! -e "$respaldo"
  url=$(sed -n 's/^DATABASE_URL=//p' "$config/environment" | tr -d '"' | sed 's/?schema=public$//')
  /usr/bin/pg_dump --format=custom --file="$respaldo" --no-owner --no-privileges "$url"
  chmod 600 "$respaldo"
  /usr/bin/pg_restore --list "$respaldo" >/dev/null
fi

sana() { # sana <puerto>
  local intento
  for intento in {1..30}; do
    if curl -fsS --max-time 5 "http://127.0.0.1:$1/api/v1/health" | grep -Fq '"database":"ok"'; then return 0; fi
    sleep 2
  done
  return 1
}
puerto_1=$(sed -n 's/^GESTION_PUERTO_1=//p' "$config/docker.env")
puerto_2=$(sed -n 's/^GESTION_PUERTO_2=//p' "$config/docker.env")
test -n "$puerto_1" && test -n "$puerto_2"

fase=migracion
if compose run --rm --no-deps migrate node node_modules/prisma/build/index.js migrate status >/dev/null 2>&1; then
  echo 'Sin migraciones pendientes: reinicio de a una copia, sin corte.'
  fase=activacion
  compose up -d --no-deps --force-recreate api-1
  sana "$puerto_1"
  compose up -d --no-deps --force-recreate api-2
  sana "$puerto_2"
  compose up -d --no-deps --force-recreate worker
else
  echo 'Hay migraciones pendientes: pausa breve de la API.'
  compose stop api-1 api-2 worker
  compose run --rm --no-deps migrate
  fase=activacion
  compose up -d --no-deps --force-recreate api-1 api-2 worker
  sana "$puerto_1"
  sana "$puerto_2"
fi

fase=salud
test "$(compose ps --status running --services | grep -c -E '^(api-1|api-2|worker)$')" = 3
printf '%s\n' "$release_id" > "$release/DEPLOYED_OK"
echo "BACKEND_DOCKER_OK: $ambiente $release_id"
