#!/usr/bin/env bash
set +x
set -euo pipefail
umask 027
test "$EUID" -eq 0
release_id=${1:?release id required}
[[ "$release_id" =~ ^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$ ]]
release="/home/ubuntu/gestion-releases/$release_id"
test "$(readlink -f "$release")" = "$release"
test -f "$release/apps/api/package.json"
exec 9>/run/lock/gestion-deploy.lock
flock -n 9 || { echo 'Ya hay otro despliegue en curso.'; exit 1; }
test -r /etc/gestion-api/environment
test -f /etc/systemd/system/gestion-api.service
systemctl is-active --quiet gestion-api
previous=$(systemctl show gestion-api -p WorkingDirectory --value)
[[ "$previous" == /home/ubuntu/gestion-app/apps/api || "$previous" == /home/ubuntu/gestion-releases/*/apps/api ]]
printf '%s\n' "$previous" > "$release/previous-working-directory.txt"
phase=preparation
trap 'echo "ERROR en fase: $phase, linea: $LINENO. Se conserva el codigo anterior. No se revierte la base automaticamente; revisar si se completo el respaldo."' ERR
cd "$release"
echo 'Instalando y compilando backend en una carpeta separada...'
runuser -u ubuntu -- /usr/local/bin/pnpm install --frozen-lockfile --filter @gestion/api...
runuser -u ubuntu -- /usr/local/bin/pnpm --filter @gestion/api prisma:generate
runuser -u ubuntu -- /usr/local/bin/pnpm --filter @gestion/contracts build
runuser -u ubuntu -- /usr/local/bin/pnpm --filter @gestion/api build
entry=$(/usr/local/bin/node "$release/deploy/oracle/api-entry.cjs")
test -s "$entry"
echo "Entrada compilada verificada: $entry"
with_environment() {
  systemd-run --quiet --wait --pipe --collect --uid=ubuntu \
    --property="WorkingDirectory=$release" \
    --property=EnvironmentFile=/etc/gestion-api/environment "$@"
}
with_environment /usr/local/bin/node "$release/deploy/oracle/check-migrations.cjs"
phase=backup
echo 'Respaldando produccion y verificando restauracion aislada...'
backup_started=$(date +%s)
systemctl start gestion-backup.service
test "$(systemctl show gestion-backup.service -p Result --value)" = success
test -s /var/backups/gestion/latest.dump
test "$(stat -Lc %Y /var/backups/gestion/latest.dump)" -ge "$backup_started"
install -d -m 700 /var/backups/gestion/releases
test ! -e "/var/backups/gestion/releases/$release_id.dump"
cp --reflink=auto /var/backups/gestion/latest.dump "/var/backups/gestion/releases/$release_id.dump"
chmod 600 "/var/backups/gestion/releases/$release_id.dump"
phase=migration
echo 'Preparando custodia cifrada para certificados, sin reemplazar claves existentes...'
bash "$release/deploy/oracle/prepare-fiscal-vault.sh"
echo 'Pausa breve de API: aplicando migraciones (sin seed ni reset)...'
systemctl stop gestion-api
with_environment /usr/local/bin/pnpm --filter @gestion/api exec prisma migrate deploy
phase=activation
install -d -m 755 /etc/systemd/system/gestion-api.service.d
dropin=/etc/systemd/system/gestion-api.service.d/50-gestion-release.conf
if test -f "$dropin"; then cp "$dropin" "$release/previous-service-dropin.conf"; fi
printf '[Service]\nWorkingDirectory=%s/apps/api\nExecStart=\nExecStart=/usr/local/bin/node %s\n' "$release" "$entry" > "$dropin.new"
chmod 644 "$dropin.new"
mv -T "$dropin.new" "$dropin"
systemctl daemon-reload
test "$(systemctl show gestion-api -p WorkingDirectory --value)" = "$release/apps/api"
systemctl show gestion-api -p ExecStart --value | grep -Fq "$entry"
systemctl start gestion-api
phase=health
healthy=0
for attempt in {1..30}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/api/v1/health | /usr/local/bin/node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{const h=JSON.parse(s);process.exit(h.status==="ok"&&h.database==="ok"?0:1)}catch{process.exit(1)}})'; then healthy=1; break; fi
  sleep 2
done
test "$healthy" = 1
systemctl is-active --quiet gestion-api
printf '%s\n' "$release_id" > "$release/DEPLOYED_OK"
echo "BACKEND_OK: $release_id"
