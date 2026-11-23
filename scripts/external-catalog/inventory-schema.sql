-- Complete public-source inventory, including rejected codes and out-of-scope
-- products. Separate from eligible lookup records and all commercial tables.
CREATE TABLE IF NOT EXISTS reference_catalog.source_record (
  source text NOT NULL,
  source_id text NOT NULL,
  fingerprint char(64) NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL,
  batch_id text NOT NULL REFERENCES reference_catalog.import_batch(id),
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, source_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS source_record_batch_source_idx
  ON reference_catalog.source_record (batch_id, source);

-- Exact-code fallback for medicines absent from the official barcode index.
-- Retailer records remain separate from the official medicine reference.
CREATE INDEX IF NOT EXISTS source_record_medicine_code_idx
  ON reference_catalog.source_record ((lpad(payload->>'code', 14, '0')))
  WHERE status = 'discard' AND payload->>'reason' = 'medicamento_en_categoria_fuente';

CREATE OR REPLACE VIEW reference_catalog.medicine_fallback AS
SELECT lpad(payload->>'code', 14, '0')::char(14) AS gtin14,
       source, source_id, payload, observed_at
FROM reference_catalog.source_record
WHERE status = 'discard'
  AND payload->>'reason' = 'medicamento_en_categoria_fuente'
  AND source IN ('public_farmalife', 'public_farmar', 'public_farmaplus',
                 'public_farmacorp', 'public_farmamix')
  AND payload->>'code' ~ '^[0-9]{8,14}$';

-- Fotos de medicamentos (SISTEMA-122): una por código, de tiendas argentinas,
-- para fichas que la proyección no medicinal descarta. Se reemplaza completa en
-- cada instalación. Sin claves foráneas a la base comercial.
CREATE TABLE IF NOT EXISTS reference_catalog.medicine_image (
  gtin14 char(14) PRIMARY KEY CHECK (gtin14 ~ '^[0-9]{14}$'),
  source text NOT NULL CHECK (source IN ('public_farmalife', 'public_farmaplus', 'public_farmar', 'public_farmamix')),
  source_ref text NOT NULL DEFAULT '',
  url text NOT NULL,
  sha256 char(64) NOT NULL,
  foto bytea NOT NULL CHECK (octet_length(foto) BETWEEN 4 AND 61440),
  batch_id text NOT NULL REFERENCES reference_catalog.import_batch(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Foto por código para medicamentos: primero la de la ficha no medicinal (si es
-- de una tienda argentina), después la bajada para medicamentos. Farmacorp no.
CREATE OR REPLACE VIEW reference_catalog.medicine_photo AS
SELECT gtin14, source, source_ref, sha256, foto, prioridad
FROM (
  SELECT p.gtin14,
         p.payload->'image'->>'source' AS source,
         COALESCE(p.payload->'image'->>'source_ref', '') AS source_ref,
         (p.payload->'image'->>'sha256')::char(64) AS sha256,
         decode(substr(p.payload->'image'->>'data_url', 24), 'base64') AS foto,
         1 AS prioridad
  FROM reference_catalog.product p
  WHERE p.eligible
    AND p.payload->'image'->>'source' IN ('public_farmalife', 'public_farmaplus', 'public_farmar', 'public_farmamix')
    AND left(p.payload->'image'->>'data_url', 23) = 'data:image/jpeg;base64,'
  UNION ALL
  SELECT m.gtin14, m.source, m.source_ref, m.sha256, m.foto, 2 AS prioridad
  FROM reference_catalog.medicine_image m
) fotos;
