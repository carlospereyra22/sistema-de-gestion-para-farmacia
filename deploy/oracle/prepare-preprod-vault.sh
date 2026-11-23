#!/usr/bin/env bash
# Clave maestra de la bóveda para test (hoy llamado preprod), SISTEMA-120.
# Sin ella la API de test no puede cifrar el secreto del código de los
# superadmin (ni credenciales fiscales de prueba) y responde 503.
# Es propia de test: nunca la de producción. Idempotente: si ya existe, no la
# reemplaza ni la muestra. Uso en el VPS: sudo bash prepare-preprod-vault.sh
set +x
set -euo pipefail
umask 077
test "$EUID" -eq 0
environment=/etc/gestion-preprod/environment
test -r "$environment"
test -f /etc/systemd/system/gestion-preprod-api.service
exec 8>/run/lock/gestion-preprod-vault.lock
flock -n 8 || { echo 'Otro proceso esta preparando la boveda de test.'; exit 1; }

# Una clave cargada a mano en el entorno es del operador: no se toca.
if grep -q '^FISCAL_VAULT_KEY=' "$environment" ||
  grep -q '^FISCAL_VAULT_KEY_FILE=' "$environment"; then
  echo 'Test ya tiene clave de boveda en su entorno. No se modifico nada.'
  exit 0
fi

directory=/etc/gestion-preprod-vault
key=$directory/vault.key
backup=/var/backups/gestion-secrets/preprod-vault.key
dropin=/etc/systemd/system/gestion-preprod-api.service.d/40-preprod-vault.conf
test ! -L "$directory"
test ! -L "$key"
test ! -L /var/backups/gestion-secrets
test ! -L "$backup"
test ! -L "$dropin"
# Nunca la misma ruta ni el mismo archivo que producción.
test "$key" != /etc/gestion-fiscal/vault.key

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
if test -e /etc/gestion-fiscal/vault.key && cmp -s "$key" /etc/gestion-fiscal/vault.key; then
  echo 'La clave de test es igual a la de produccion. No se continua.'
  exit 1
fi
chown root:ubuntu "$key"
chmod 440 "$key"

install -d -o root -g root -m 700 /var/backups/gestion-secrets
if test -e "$backup"; then
  cmp -s "$key" "$backup" || { echo 'El respaldo de la clave de test no coincide. No se reemplazo.'; exit 1; }
else
  install -o root -g root -m 600 "$key" "$backup"
fi
cmp -s "$key" "$backup"

install -d -m 755 /etc/systemd/system/gestion-preprod-api.service.d
expected="[Service]
Environment=FISCAL_VAULT_KEY_FILE=$key"
if test -e "$dropin"; then
  printf '%s\n' "$expected" | cmp -s - "$dropin" || { echo 'Existe otra configuracion de la boveda de test. No se reemplazo.'; exit 1; }
else
  printf '%s\n' "$expected" > "$dropin"
  chmod 644 "$dropin"
fi

systemctl daemon-reload
systemctl restart gestion-preprod-api
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/api/v1/health > /dev/null 2>&1; then
    echo 'Boveda de test preparada y API de test reiniciada. Produccion no se toco.'
    exit 0
  fi
  sleep 2
done
echo 'La API de test no respondio despues de reiniciar. Revisar: journalctl -u gestion-preprod-api'
exit 1
