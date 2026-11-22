# Catálogo externo: actualización mensual y aportes en el servidor

SISTEMA-112 (aportes de las farmacias) y SISTEMA-113 (actualización mensual).
Todo esto se hace **una sola vez** por servidor, con autorización explícita y
fuera del horario de cobros. El servidor sigue en modo systemd: no hace falta
Docker. Detalle del proceso en `docs/EXTERNAL_PRODUCT_CATALOG.md`.

## Qué queda andando

- **Día 1 de cada mes a las 04:00 de Argentina** (`gestion-catalogo-mensual.timer`):
  descarga Farmalife, Farmaplus, Farmar, Farmamix y Farmacorp, prepara, baja fotos,
  audita e instala **sólo si los controles dan bien**. Sólo suma productos; los que
  una tienda deja de publicar quedan como históricos. Antes de instalar respalda la
  base en `/var/backups/gestion-catalogo` (quedan los de tres meses).
- **Cada 10 minutos** (dentro de la API de cada ambiente): los aportes de las
  farmacias. Producción y test comparten la base del catálogo; cada uno guarda y ve
  sólo los suyos.

Usuario del sistema `gestion-catalogo`, datos en `/var/lib/gestion-catalogo/datos`
(unos 5 GB), scripts en `/usr/local/lib/gestion-catalogo`. Nunca toca la base
comercial.

## 1. uv (una vez)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sudo env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh
/usr/local/bin/uv --version
```

## 2. Roles de la base del catálogo (una vez)

`catalogo_juncos_external` ya existe. Hacen falta dos roles nuevos: uno que carga
las capturas (dueño de las tablas de las tiendas) y otro que sólo escribe aportes.

```bash
carga=$(openssl rand -hex 24); aportes=$(openssl rand -hex 24)
dueno=$(sudo -u postgres psql -tAc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='catalogo_juncos_external'")
# Si el dueño es postgres, FRENAR: darle esa pertenencia sería darle superusuario.
# Primero pasar la base y sus esquemas a un dueño propio y volver a este paso.
test "$dueno" != postgres
sudo -u postgres psql -v ON_ERROR_STOP=1 -v carga="$carga" -v aportes="$aportes" -v dueno="$dueno" <<'SQL'
CREATE ROLE gestion_catalogo_carga LOGIN PASSWORD :'carga';
GRANT :"dueno" TO gestion_catalogo_carga;
CREATE ROLE gestion_catalogo_aportes LOGIN PASSWORD :'aportes';
GRANT CONNECT ON DATABASE catalogo_juncos_external TO gestion_catalogo_carga, gestion_catalogo_aportes;
SQL
```

Esquema de aportes y permisos, una vez por cada rol de lectura (test y producción;
el de test es `gestion_preprod_catalog`, el de producción figura en
`EXTERNAL_CATALOG_DATABASE_URL` de `/etc/gestion-api/environment`):

```bash
cd /home/ubuntu/gestion-releases/<id>
for lector in gestion_preprod_catalog <rol de lectura de producción>; do
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d catalogo_juncos_external \
    -v lector="$lector" -v escritor=gestion_catalogo_aportes \
    -f scripts/external-catalog/aportes-schema.sql
done
```

Guardar las dos claves para los pasos 3 y 5; no se vuelven a mostrar.

## 3. Configuración de la carga mensual (una vez)

```bash
sudo install -d -m 750 -o root -g root /etc/gestion-catalogo
sudo tee /etc/gestion-catalogo/environment >/dev/null <<EOF
CATALOGO_DATABASE_URL=postgresql://gestion_catalogo_carga:$carga@127.0.0.1:5432/catalogo_juncos_external
CATALOGO_RESPALDOS=/var/backups/gestion-catalogo
EOF
sudo chmod 640 /etc/gestion-catalogo/environment
```

(Después de `install.sh`, `sudo chgrp gestion-catalogo /etc/gestion-catalogo /etc/gestion-catalogo/environment`.)

## 4. Instalar y subir los datos de trabajo (una vez)

```bash
sudo bash /home/ubuntu/gestion-releases/<id>/deploy/oracle/catalogo-mensual/install.sh
```

Desde la PC (PowerShell, en la carpeta del repo), subir la captura vigente; sin
`staging`:

```powershell
scp -r data/external-catalog/baseline data/external-catalog/current data/external-catalog/sources data/external-catalog/images ubuntu@<servidor>:/tmp/catalogo-datos/
```

En el servidor:

```bash
sudo rsync -a /tmp/catalogo-datos/ /var/lib/gestion-catalogo/datos/
sudo chown -R gestion-catalogo:gestion-catalogo /var/lib/gestion-catalogo/datos
rm -rf /tmp/catalogo-datos
```

Primera corrida a mano, mirando (tarda horas):

```bash
sudo systemctl start --no-block gestion-catalogo-mensual.service
journalctl -fu gestion-catalogo-mensual.service
```

## 5. Aportes en la API (una vez por ambiente)

En `/etc/gestion-api/environment` (producción):

```
CATALOG_APORTES_AMBIENTE=produccion
CATALOG_APORTES_DATABASE_URL=postgresql://gestion_catalogo_aportes:<clave>@127.0.0.1:5432/catalogo_juncos_external
```

En `/etc/gestion-preprod/environment` (test), lo mismo con
`CATALOG_APORTES_AMBIENTE=test`. Reiniciar cada API después de publicar la versión
con SISTEMA-112.

## Operación

| Qué                      | Comando                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| Próxima corrida          | `systemctl list-timers gestion-catalogo-mensual.timer`             |
| Ver la última corrida    | `journalctl -u gestion-catalogo-mensual.service -n 80`             |
| Resumen (nuevos, motivo) | `sudo ls /var/lib/gestion-catalogo/datos/resumenes/`               |
| Correrla ahora           | `sudo systemctl start --no-block gestion-catalogo-mensual.service` |
| Apagarla                 | `sudo systemctl disable --now gestion-catalogo-mensual.timer`      |
| Actualizar los scripts   | `sudo bash .../catalogo-mensual/install.sh --actualizar`           |

Si el resumen dice `"detenido"`, la base quedó como estaba: leer el motivo (una
tienda devolvió mucho menos, faltarían códigos vigentes, falló la auditoría) y el
registro del paso en `datos/staging/refresh-<fecha>/logs/`.

**Nunca** reemplazar la base entera por una restaurada (como el 01/11/2026): se
perderían los aportes de las farmacias.
