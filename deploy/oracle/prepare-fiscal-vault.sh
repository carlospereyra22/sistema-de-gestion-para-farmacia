#!/usr/bin/env bash
# Idempotent setup. Never print or rotate existing key material.
set +x
set -euo pipefail
umask 077
test "$EUID" -eq 0
test -r /etc/gestion-api/environment
exec 8>/run/lock/gestion-fiscal-vault.lock
flock -n 8 || { echo 'Otro proceso esta preparando el custodio fiscal.'; exit 1; }
# An existing external key belongs to the operator; do not replace it.
if grep -q '^FISCAL_VAULT_KEY=' /etc/gestion-api/environment; then
  echo 'Se conserva la clave maestra externa existente. Verificar su respaldo separado.'
  exit 0
fi
if grep -q '^FISCAL_VAULT_KEY_FILE=' /etc/gestion-api/environment; then
  echo 'Se conserva la ruta externa existente. Verificar su respaldo separado.'
  exit 0
fi
directory=/etc/gestion-fiscal
key=/etc/gestion-fiscal/vault.key
backup=/var/backups/gestion-secrets/fiscal-vault.key
dropin=/etc/systemd/system/gestion-api.service.d/40-fiscal-vault.conf
test ! -L "$directory"
test ! -L "$key"
test ! -L /var/backups/gestion-secrets
test ! -L "$backup"
test ! -L "$dropin"
install -d -o root -g ubuntu -m 750 "$directory"
if test ! -e "$key"; then
  temporary=$(mktemp "$directory/new-key.XXXXXX")
  trap 'test -z "${temporary:-}" || rm -f -- "$temporary"' EXIT
  openssl rand -hex 32 > "$temporary"
  chown root:ubuntu "$temporary"
  chmod 440 "$temporary"
  mv -n -T "$temporary" "$key"
fi
test "$(wc -c < "$key")" -eq 65
grep -Eq '^[a-f0-9]{64}$' "$key"
chown root:ubuntu "$key"
chmod 440 "$key"
install -d -o root -g root -m 700 /var/backups/gestion-secrets
if test -e "$backup"; then
  cmp -s "$key" "$backup" || { echo 'El respaldo de la clave no coincide. No se reemplazo.'; exit 1; }
else
  install -o root -g root -m 600 "$key" "$backup"
fi
cmp -s "$key" "$backup"
install -d -m 755 /etc/systemd/system/gestion-api.service.d
expected='[Service]
Environment=FISCAL_VAULT_KEY_FILE=/etc/gestion-fiscal/vault.key'
if test -e "$dropin"; then
  printf '%s\n' "$expected" | cmp -s - "$dropin" || { echo 'Existe otra configuracion del custodio. No se reemplazo.'; exit 1; }
else
  printf '%s\n' "$expected" > "$dropin"
  chmod 644 "$dropin"
fi
systemctl daemon-reload
echo 'Custodio preparado. Clave conservada fuera de la base; copia de recuperacion local verificada.'
echo 'Requiere respaldo externo protegido antes de habilitar emision real. No se reinicio la API.'
