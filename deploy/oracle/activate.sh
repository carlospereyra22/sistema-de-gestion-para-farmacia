#!/usr/bin/env bash
set +x
set -euo pipefail
if [ "$EUID" -ne 0 ]; then
  echo 'Ejecutar con sudo bash deploy/oracle/activate.sh'
  exit 1
fi
cd /home/ubuntu/gestion-app
test -f apps/api/dist/src/main.js
test -x /usr/local/bin/node
test -x /snap/bin/certbot
openssl x509 -in /etc/letsencrypt/live/gestion-api-ip/fullchain.pem -noout -checkend 86400
if [ -e /etc/systemd/system/gestion-api.service ] ||
   [ -e /etc/nginx/sites-available/gestion-api ] ||
   [ -e /etc/nginx/sites-enabled/gestion-api ]; then
  echo 'Ya existe una configuracion de gestion-api. No se sobrescribio. Revisar antes de repetir.'
  exit 1
fi
install -d -m 700 /etc/gestion-api
if [ ! -e /etc/gestion-api/environment ]; then
  read -r -s -p 'Clave de PostgreSQL de gestion_app: ' clave_db </dev/tty
  echo
  trap 'unset clave_db' EXIT
  CLAVE_DB="$clave_db" /usr/local/bin/node <<'NODE'
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
if (!process.env.CLAVE_DB) throw new Error('La clave no puede estar vacia');
const url = new URL('postgresql://gestion_app@127.0.0.1:5432/gestion_prod?schema=public');
url.password = process.env.CLAVE_DB;
const content = [
  'NODE_ENV=production',
  'HOST=127.0.0.1',
  'PORT=3000',
  'CORS_ORIGIN=https://163.176.241.51',
  `DATABASE_URL=${url.href}`,
  `JWT_ACCESS_SECRET=${randomBytes(48).toString('hex')}`,
  '',
].join('\n');
fs.writeFileSync('/etc/gestion-api/environment', content, { mode: 0o600, flag: 'wx' });
NODE
  unset clave_db
fi
install -m 644 deploy/oracle/gestion-api.service /etc/systemd/system/gestion-api.service
systemctl daemon-reload
systemctl enable --now gestion-api
echo 'Verificando API y base de datos...'
if ! curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 2 --max-time 5 http://127.0.0.1:3000/api/v1/health; then
  echo 'La API no respondio correctamente. No se activo Nginx. No compartir el archivo environment.'
  exit 1
fi
echo
install -m 644 deploy/oracle/gestion-api.nginx /etc/nginx/sites-available/gestion-api
ln -s /etc/nginx/sites-available/gestion-api /etc/nginx/sites-enabled/gestion-api
nginx -t
systemctl reload nginx
echo 'Verificando HTTPS con certificado confiable...'
curl --fail --silent --show-error --connect-to 163.176.241.51:443:127.0.0.1:443 https://163.176.241.51/api/v1/health
echo
systemctl is-active gestion-api nginx
echo 'API y HTTPS activos localmente. Comprobando renovacion...'
/snap/bin/certbot renew --cert-name gestion-api-ip --dry-run --run-deploy-hooks
systemctl list-timers --all --no-pager | grep certbot
echo 'Configuracion finalizada. Falta verificar acceso externo y publicar Netlify.'
