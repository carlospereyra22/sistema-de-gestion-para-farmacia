#!/usr/bin/env bash
set +x
set -euo pipefail
umask 0077
test "$EUID" -eq 0
cd /
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS
export PGHOST=/var/run/postgresql PGPORT=5432 PGUSER=postgres
exec 9>/run/lock/gestion-backup.lock
flock -n 9 || { echo 'Ya hay un respaldo en ejecucion.'; exit 1; }
pgbin=/usr/lib/postgresql/18/bin
root=/var/backups/gestion
test "$(readlink -f "$root")" = "$root"
for directory in daily weekly; do
  test "$(readlink -f "$root/$directory")" = "$root/$directory"
done
db_size=$(runuser -u postgres -- "$pgbin/psql" -XAt -d postgres -c "SELECT pg_database_size('gestion_prod')")
available=$(df -B1 --output=avail "$root" | tail -1 | tr -d ' ')
if (( available < db_size * 2 + 2147483648 )); then
  echo 'Espacio insuficiente para respaldo y prueba de restauracion; copias anteriores conservadas.'
  exit 1
fi
partial=$(mktemp "$root/.partial-XXXXXXXX.dump")
restore_created=0
restore_db=''
cleanup() {
  if [ "$restore_created" = 1 ] && [[ "$restore_db" =~ ^gestion_restorecheck_[a-f0-9]{32}$ ]]; then
    runuser -u postgres -- "$pgbin/dropdb" --if-exists "$restore_db" || echo 'ATENCION: no se pudo retirar la base temporal de prueba.'
  fi
  if [[ "$partial" == "$root"/.partial-*.dump ]]; then
    rm -f -- "$partial"
  fi
}
trap cleanup EXIT
echo 'Generando copia consistente de gestion_prod...'
runuser -u postgres -- "$pgbin/pg_dump" --dbname=gestion_prod --format=custom --no-owner --no-acl > "$partial"
"$pgbin/pg_restore" --list "$partial" >/dev/null
read -r restore_id < /proc/sys/kernel/random/uuid
restore_db="gestion_restorecheck_${restore_id//-/}"
[[ "$restore_db" =~ ^gestion_restorecheck_[a-f0-9]{32}$ ]]
runuser -u postgres -- "$pgbin/createdb" --template=template0 "$restore_db"
restore_created=1
runuser -u postgres -- "$pgbin/psql" -X -v ON_ERROR_STOP=1 -d postgres -c "REVOKE CONNECT ON DATABASE $restore_db FROM PUBLIC" >/dev/null
echo 'Restaurando en una base temporal aislada...'
# stdin is opened by root; postgres never needs read access to the backup folder.
runuser -u postgres -- "$pgbin/pg_restore" --dbname="$restore_db" --no-owner --no-acl --single-transaction < "$partial"
runuser -u postgres -- "$pgbin/psql" -X -v ON_ERROR_STOP=1 -d "$restore_db" -c 'SELECT count(*) AS organizaciones FROM "Organization"; SELECT count(*) AS usuarios FROM "User"; SELECT count(*) AS migraciones FROM "_prisma_migrations";'
runuser -u postgres -- "$pgbin/dropdb" "$restore_db"
restore_created=0
day=$(date -u +%F)
week=$(date -u +%G-W%V)
chown root:ubuntu "$partial"
chmod 640 "$partial"
mv -T -- "$partial" "$root/daily/gestion-$day.dump"
# Keep the first successful snapshot of each ISO week, without duplicating data blocks.
if [ ! -e "$root/weekly/gestion-$week.dump" ]; then
  ln -- "$root/daily/gestion-$day.dump" "$root/weekly/gestion-$week.dump"
fi
ln -s "daily/gestion-$day.dump" "$root/.latest-$$"
mv -Tf "$root/.latest-$$" "$root/latest.dump"
/usr/local/bin/node /usr/local/lib/gestion-backup/retention.cjs
echo "RESPALDO Y RESTAURACION OK: gestion-$day.dump"
echo 'latest.dump disponible para descargar por SSH; no publicar en Netlify.'
