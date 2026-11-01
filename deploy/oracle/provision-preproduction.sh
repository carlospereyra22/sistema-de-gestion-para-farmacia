#!/usr/bin/env bash
# One-time provisioning. It reads the owner password from stdin and never logs it.
set +x
set -euo pipefail
umask 027

if [ "$EUID" -ne 0 ]; then
  echo 'Ejecutar con sudo.' >&2
  exit 1
fi

release=${1:?release directory required}
test "$(readlink -f "$release")" = "$release"
test -f "$release/apps/api/package.json"
test -f "$release/deploy/oracle/gestion-preprod-api.service"
test -x /usr/local/bin/node

read -r -p 'Organizacion de preproduccion: ' bootstrap_organization
read -r -p 'Sucursal de preproduccion: ' bootstrap_branch
read -r -p 'Correo del propietario: ' bootstrap_email
read -r -s -p 'Clave inicial del propietario (16 caracteres minimo): ' bootstrap_password
echo
trap 'unset bootstrap_password app_password catalog_password jwt_secret database_url catalog_url' EXIT

test -n "$bootstrap_organization"
test -n "$bootstrap_branch"
test -n "$bootstrap_email"
test "${#bootstrap_password}" -ge 16
test ! -e /etc/gestion-preprod/environment
test ! -e /etc/systemd/system/gestion-preprod-api.service
test ! -e /etc/nginx/snippets/gestion-preprod-api.conf

app_password=$(/usr/local/bin/node -e 'process.stdout.write(require("node:crypto").randomBytes(36).toString("base64url"))')
catalog_password=$(/usr/local/bin/node -e 'process.stdout.write(require("node:crypto").randomBytes(36).toString("base64url"))')
jwt_secret=$(/usr/local/bin/node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("hex"))')

sudo -n -u postgres psql -v ON_ERROR_STOP=1 \
  -v app_password="$app_password" -v catalog_password="$catalog_password" <<'SQL'
CREATE ROLE gestion_preprod_app LOGIN PASSWORD :'app_password';
CREATE DATABASE gestion_preprod OWNER gestion_preprod_app;
CREATE ROLE gestion_preprod_catalog LOGIN PASSWORD :'catalog_password';
GRANT CONNECT ON DATABASE catalogo_juncos_external TO gestion_preprod_catalog;
\connect catalogo_juncos_external
GRANT USAGE ON SCHEMA reference_catalog, beauty_odbl TO gestion_preprod_catalog;
GRANT SELECT ON TABLE reference_catalog.product, beauty_odbl.product TO gestion_preprod_catalog;
GRANT SELECT ON TABLE reference_catalog.medicine_fallback TO gestion_preprod_catalog;
SQL

database_url=$(APP_PASSWORD="$app_password" /usr/local/bin/node - <<'NODE'
const url = new URL('postgresql://gestion_preprod_app@127.0.0.1:5432/gestion_preprod?schema=public');
url.password = process.env.APP_PASSWORD;
process.stdout.write(url.href);
NODE
)
catalog_url=$(CATALOG_PASSWORD="$catalog_password" /usr/local/bin/node - <<'NODE'
const url = new URL('postgresql://gestion_preprod_catalog@127.0.0.1:5432/catalogo_juncos_external');
url.password = process.env.CATALOG_PASSWORD;
process.stdout.write(url.href);
NODE
)

install -d -m 700 /etc/gestion-preprod
cat > /etc/gestion-preprod/environment <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
CORS_ORIGIN=https://163.176.241.51
DATABASE_URL=$database_url
JWT_ACCESS_SECRET=$jwt_secret
FISCAL_LOCAL_TESTING=true
FISCAL_PRODUCTION_ISSUANCE=disabled
EXTERNAL_CATALOG_ENABLED=true
EXTERNAL_CATALOG_DATABASE_URL=$catalog_url
EOF
chmod 600 /etc/gestion-preprod/environment

cd "$release"
runuser -u ubuntu -- /usr/local/bin/pnpm install --frozen-lockfile --filter @gestion/api...
runuser -u ubuntu -- /usr/local/bin/pnpm --filter @gestion/api prisma:generate
runuser -u ubuntu -- /usr/local/bin/pnpm --filter @gestion/contracts build
runuser -u ubuntu -- /usr/local/bin/pnpm --filter @gestion/api build
entry=$(/usr/local/bin/node "$release/deploy/oracle/api-entry.cjs")
test -s "$entry"

set -a
# shellcheck disable=SC1091
source /etc/gestion-preprod/environment
set +a
runuser -u ubuntu -- env \
  DATABASE_URL="$DATABASE_URL" \
  BOOTSTRAP_ORGANIZATION="$bootstrap_organization" \
  BOOTSTRAP_BRANCH="$bootstrap_branch" \
  BOOTSTRAP_EMAIL="$bootstrap_email" \
  BOOTSTRAP_PASSWORD="$bootstrap_password" \
  /usr/local/bin/pnpm --filter @gestion/api exec prisma migrate deploy
runuser -u ubuntu -- env \
  DATABASE_URL="$DATABASE_URL" \
  BOOTSTRAP_ORGANIZATION="$bootstrap_organization" \
  BOOTSTRAP_BRANCH="$bootstrap_branch" \
  BOOTSTRAP_EMAIL="$bootstrap_email" \
  BOOTSTRAP_PASSWORD="$bootstrap_password" \
  /usr/local/bin/pnpm --filter @gestion/api exec ts-node prisma/bootstrap-production.ts

organization_id=$(runuser -u ubuntu -- env DATABASE_URL="$DATABASE_URL" /usr/local/bin/node - <<'NODE'
const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');
const prisma = new PrismaClient();
prisma.organization.findFirst({ select: { id: true } })
  .then((organization) => {
    if (!organization) throw new Error('Organizacion inicial ausente.');
    process.stdout.write(organization.id);
  })
  .finally(() => prisma.$disconnect());
NODE
)
printf 'EXTERNAL_CATALOG_ORGANIZATION_ID=%s\n' "$organization_id" >> /etc/gestion-preprod/environment

install -m 644 "$release/deploy/oracle/gestion-preprod-api.service" /etc/systemd/system/gestion-preprod-api.service
install -d -m 755 /etc/systemd/system/gestion-preprod-api.service.d
cat > /etc/systemd/system/gestion-preprod-api.service.d/50-gestion-preprod-release.conf <<EOF
[Service]
WorkingDirectory=$release/apps/api
ExecStart=
ExecStart=/usr/local/bin/node $entry
EOF
chmod 644 /etc/systemd/system/gestion-preprod-api.service.d/50-gestion-preprod-release.conf
install -d -m 755 /etc/nginx/snippets
install -m 644 "$release/deploy/oracle/gestion-preprod-api.nginx" /etc/nginx/snippets/gestion-preprod-api.conf
ln -sfn "$release" /home/ubuntu/gestion-preprod-releases/current

nginx_site=/etc/nginx/sites-available/gestion-api
test -f "$nginx_site"
grep -Fq 'location /api/v1/' "$nginx_site"
cp -a "$nginx_site" "$nginx_site.preprod-before-$(date +%Y%m%d%H%M%S).bak"
if ! grep -Fq 'include /etc/nginx/snippets/gestion-preprod-api.conf;' "$nginx_site"; then
  sed -i '/^    location \/ {/i\    include /etc/nginx/snippets/gestion-preprod-api.conf;' "$nginx_site"
fi
nginx -t
systemctl daemon-reload
systemctl enable --now gestion-preprod-api
systemctl reload nginx

for attempt in {1..30}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3001/api/v1/health | grep -Fq '"status":"ok"'; then break; fi
  test "$attempt" -lt 30 || { echo 'La API de preproduccion no respondio.' >&2; exit 1; }
  sleep 2
done
curl -fsS --max-time 10 https://163.176.241.51/preprod/api/v1/health | grep -Fq '"database":"ok"'
echo 'PREPRODUCTION_READY'
