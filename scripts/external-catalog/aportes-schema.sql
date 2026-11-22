-- Aportes de las farmacias al catálogo externo (SISTEMA-112).
-- Sólo en la base independiente catalogo_juncos_external; sin claves foráneas a la
-- base comercial. Lo escribe el worker de la API con un rol propio que sólo puede
-- tocar este esquema; las fichas de las tiendas siguen siendo de sólo lectura.
-- Es idempotente: se puede aplicar las veces que haga falta.
CREATE SCHEMA IF NOT EXISTS aporte_farmacia;

-- Una fila por ambiente, código y farmacia. "ambiente" separa producción, test y
-- la PC: test y producción comparten esta base y un producto de prueba no puede
-- ofrecerse a las farmacias reales.
CREATE TABLE IF NOT EXISTS aporte_farmacia.producto (
  ambiente text NOT NULL CHECK (ambiente ~ '^[a-z0-9-]{1,20}$'),
  gtin14 char(14) NOT NULL CHECK (gtin14 ~ '^[0-9]{14}$'),
  organization_id uuid NOT NULL,
  product_id uuid NOT NULL,
  nombre text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 300),
  marca text NOT NULL DEFAULT '',
  presentacion text NOT NULL DEFAULT '',
  categoria_ruta text[] NOT NULL DEFAULT '{}',
  foto bytea,
  foto_sha256 char(64),
  vigente boolean NOT NULL DEFAULT true,
  creado timestamptz NOT NULL DEFAULT now(),
  actualizado timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ambiente, gtin14, organization_id)
);

CREATE INDEX IF NOT EXISTS producto_consulta_idx
  ON aporte_farmacia.producto (ambiente, gtin14, actualizado DESC)
  WHERE vigente;
CREATE INDEX IF NOT EXISTS producto_origen_idx
  ON aporte_farmacia.producto (ambiente, organization_id, product_id);

-- Hasta dónde se recorrieron los productos de cada ambiente (orden por fecha de
-- cambio y id, para no saltear productos con la misma fecha).
CREATE TABLE IF NOT EXISTS aporte_farmacia.recoleccion (
  ambiente text PRIMARY KEY CHECK (ambiente ~ '^[a-z0-9-]{1,20}$'),
  hasta timestamptz NOT NULL,
  ultimo_id uuid NOT NULL,
  actualizado timestamptz NOT NULL DEFAULT now()
);

-- Permisos (con psql: -v lector=<rol de la API> -v escritor=<rol del worker>).
-- El lector sólo consulta; el escritor sólo agrega o actualiza aportes y lee las
-- fichas de las tiendas para no duplicarlas.
GRANT USAGE ON SCHEMA aporte_farmacia TO :"lector", :"escritor";
GRANT SELECT ON aporte_farmacia.producto TO :"lector";
GRANT SELECT, INSERT, UPDATE ON aporte_farmacia.producto, aporte_farmacia.recoleccion TO :"escritor";
GRANT USAGE ON SCHEMA reference_catalog, beauty_odbl TO :"escritor";
GRANT SELECT ON reference_catalog.product, beauty_odbl.product TO :"escritor";
