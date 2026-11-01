#!/usr/bin/env bash
set +x
set -euo pipefail
umask 027
test "$EUID" -eq 0

release_id=${1:?release id required}
[[ "$release_id" =~ ^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$ ]]
release="/home/ubuntu/gestion-preprod-releases/$release_id"
test "$(readlink -f "$release")" = "$release"
test -f "$release/apps/api/package.json"
test -r /etc/gestion-preprod/environment
test -f /etc/systemd/system/gestion-preprod-api.service

exec 9>/run/lock/gestion-preprod-deploy.lock
flock -n 9 || { echo 'Ya hay un despliegue de preproduccion en curso.'; exit 1; }

previous=$(systemctl show gestion-preprod-api -p WorkingDirectory --value)
[[ "$previous" == /home/ubuntu/gestion-preprod-releases/*/apps/api ]]
printf '%s\n' "$previous" > "$release/previous-working-directory.txt"

phase=preparation
trap 'echo "ERROR en preproduccion, fase: $phase, linea: $LINENO. Se conserva el release anterior; revisar el respaldo antes de decidir una recuperacion."' ERR
cd "$release"
runuser -u ubuntu -- /usr/local/bin/pnpm install --frozen-lockfile --filter @gestion/api...
runuser -u ubuntu -- /usr/local/bin/pnpm --filter @gestion/api prisma:generate
runuser -u ubuntu -- /usr/local/bin/pnpm --filter @gestion/contracts build
runuser -u ubuntu -- /usr/local/bin/pnpm --filter @gestion/api build
entry=$(/usr/local/bin/node "$release/deploy/oracle/api-entry.cjs")
test -s "$entry"

with_environment() {
  systemd-run --quiet --wait --pipe --collect --uid=ubuntu \
    --property="WorkingDirectory=$release" \
    --property=EnvironmentFile=/etc/gestion-preprod/environment "$@"
}
set -a
# shellcheck disable=SC1091
source /etc/gestion-preprod/environment
set +a
with_environment /usr/local/bin/node "$release/deploy/oracle/check-preprod-migrations.cjs"

phase=backup
install -d -m 700 /var/backups/gestion-preprod/releases
backup="/var/backups/gestion-preprod/releases/$release_id.dump"
test ! -e "$backup"
database_url_no_schema=$(printf '%s' "$DATABASE_URL" | sed 's/?schema=public$//')
/usr/bin/pg_dump --format=custom --file="$backup" --no-owner --no-privileges "$database_url_no_schema"
chmod 600 "$backup"
/usr/bin/pg_restore --list "$backup" >/dev/null

phase=migration
systemctl stop gestion-preprod-api
with_environment /usr/local/bin/pnpm --filter @gestion/api exec prisma migrate deploy

phase=activation
install -d -m 755 /etc/systemd/system/gestion-preprod-api.service.d
dropin=/etc/systemd/system/gestion-preprod-api.service.d/50-gestion-preprod-release.conf
if test -f "$dropin"; then cp "$dropin" "$release/previous-service-dropin.conf"; fi
printf '[Service]\nWorkingDirectory=%s/apps/api\nExecStart=\nExecStart=/usr/local/bin/node %s\n' "$release" "$entry" > "$dropin.new"
chmod 644 "$dropin.new"
mv -T "$dropin.new" "$dropin"
ln -sfn "$release" /home/ubuntu/gestion-preprod-releases/current
systemctl daemon-reload
systemctl start gestion-preprod-api

phase=health
for attempt in {1..30}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3001/api/v1/health | grep -Fq '"database":"ok"'; then
    printf '%s\n' "$release_id" > "$release/DEPLOYED_OK"
    echo "PREPRODUCTION_BACKEND_OK: $release_id"
    exit 0
  fi
  sleep 2
done
echo 'La API de preproduccion no paso salud.' >&2
exit 1
