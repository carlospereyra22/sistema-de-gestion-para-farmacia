#!/usr/bin/env bash
set -euo pipefail
test "$EUID" -eq 0
cd /home/ubuntu/gestion-app/deploy/oracle/backups
for target in /usr/local/sbin/gestion-backup /usr/local/lib/gestion-backup /etc/systemd/system/gestion-backup.service /etc/systemd/system/gestion-backup.timer /var/backups/gestion; do
  if [ -e "$target" ] || [ -L "$target" ]; then
    echo "Ya existe $target. No se sobrescribio; revisar antes de repetir."
    exit 1
  fi
done
test -x /usr/lib/postgresql/18/bin/pg_dump
test -x /usr/local/bin/node
install -d -o root -g ubuntu -m 750 /var/backups/gestion /var/backups/gestion/daily /var/backups/gestion/weekly
install -d -o root -g root -m 755 /usr/local/lib/gestion-backup
install -m 644 retention.cjs /usr/local/lib/gestion-backup/retention.cjs
install -m 750 backup.sh /usr/local/sbin/gestion-backup
install -m 644 gestion-backup.service /etc/systemd/system/gestion-backup.service
install -m 644 gestion-backup.timer /etc/systemd/system/gestion-backup.timer
systemd-analyze verify /etc/systemd/system/gestion-backup.service /etc/systemd/system/gestion-backup.timer
systemctl daemon-reload
systemctl start gestion-backup.service
systemctl enable --now gestion-backup.timer
journalctl -u gestion-backup.service -n 15 --no-pager
systemctl list-timers gestion-backup.timer --no-pager
echo 'Copias locales programadas. Falta descargar una copia fuera de Oracle.'
